import { NextResponse } from "next/server";
import { getCurrentHouseholdId } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { RESOURCE_STORAGE_BUCKET, chunkStoragePaths } from "@/lib/resource-storage";

type Context = { params: Promise<{ resourceId: string }> };

export async function POST(request: Request, context: Context) {
  const { resourceId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let householdId: string;
  try { householdId = await getCurrentHouseholdId(supabase, auth.user.id); } catch { return NextResponse.json({ error: "Household membership required." }, { status: 403 }); }
  const { data: resource, error: resourceError } = await supabase.from("resources").select("id").eq("id", resourceId).eq("household_id", householdId).single();
  if (resourceError || !resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server cleanup is not configured." }, { status: 503 }); }
  let requestedIntentIds: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.intentIds)) requestedIntentIds = body.intentIds.filter((id: unknown): id is string => typeof id === "string");
  } catch { /* Cleanup requests may have no body. */ }
  let intentsQuery = admin.from("resource_upload_intents").select("id, attachment_id, storage_path, finalized_at").eq("household_id", householdId).eq("resource_id", resourceId).is("finalized_at", null);
  if (requestedIntentIds.length) intentsQuery = intentsQuery.in("id", requestedIntentIds);
  else intentsQuery = intentsQuery.lt("expires_at", new Date().toISOString());
  const { data: intents, error: intentsError } = await intentsQuery;
  if (intentsError) return NextResponse.json({ error: "Unable to inspect pending uploads." }, { status: 500 });
  for (const intent of intents || []) {
    const { data: matchingAttachment } = await admin.from("attachments").select("id").eq("id", intent.attachment_id).eq("household_id", householdId).eq("parent_type", "resource").eq("parent_id", resourceId).eq("storage_path", intent.storage_path).maybeSingle();
    if (matchingAttachment) {
      await admin.from("resource_upload_intents").update({ finalized_at: new Date().toISOString(), cleanup_locked_until: null }).eq("id", intent.id).eq("household_id", householdId).is("finalized_at", null);
      continue;
    }
    const job = await admin.from("resource_storage_cleanup_jobs").insert({ household_id: householdId, resource_id: resourceId, attachment_ids: [], storage_paths: [intent.storage_path], reason: "upload_rollback" }).select("id").single();
    if (job.error || !job.data) return NextResponse.json({ error: "Unable to schedule pending-upload cleanup." }, { status: 502 });
    const { error: intentDeleteError } = await admin.from("resource_upload_intents").delete().eq("id", intent.id).eq("household_id", householdId).is("finalized_at", null);
    if (intentDeleteError) return NextResponse.json({ error: "Unable to finalize pending-upload cleanup." }, { status: 502 });
  }
  const { data: jobs, error } = await supabase.from("resource_storage_cleanup_jobs").select("id, attachment_ids, storage_paths, retry_count, locked_until").eq("household_id", householdId).eq("resource_id", resourceId).order("created_at");
  if (error) return NextResponse.json({ error: "Unable to load cleanup jobs." }, { status: 500 });
  for (const job of jobs || []) {
    if (job.locked_until && new Date(job.locked_until).getTime() > Date.now()) continue;
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const claim = await admin.from("resource_storage_cleanup_jobs").update({ locked_until: lockedUntil, retry_count: (job.retry_count || 0) + 1, updated_at: new Date().toISOString(), last_error: null }).eq("id", job.id).eq("household_id", householdId).or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`).select("id").single();
    if (claim.error || !claim.data) continue;
    const metadata = job.attachment_ids?.length ? await admin.from("attachments").delete().eq("household_id", householdId).eq("parent_type", "resource").eq("parent_id", resourceId).in("id", job.attachment_ids) : { error: null };
    if (metadata.error) { await admin.from("resource_storage_cleanup_jobs").update({ locked_until: null, last_error: "Attachment metadata cleanup failed.", updated_at: new Date().toISOString() }).eq("id", job.id); return NextResponse.json({ error: `Cleanup job ${job.id} is still pending.` }, { status: 502 }); }
    for (const chunk of chunkStoragePaths(job.storage_paths, 100)) {
      const storage = await admin.storage.from(RESOURCE_STORAGE_BUCKET).remove(chunk);
      if (storage.error) { await admin.from("resource_storage_cleanup_jobs").update({ locked_until: null, last_error: "Storage cleanup failed.", updated_at: new Date().toISOString() }).eq("id", job.id); return NextResponse.json({ error: `Cleanup job ${job.id} is still pending.` }, { status: 502 }); }
    }
    await admin.from("resource_storage_cleanup_jobs").delete().eq("id", job.id).eq("household_id", householdId);
  }
  return NextResponse.json({ cleaned: (jobs || []).length });
}
