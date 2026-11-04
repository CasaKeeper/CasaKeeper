import { NextResponse } from "next/server";
import { getCurrentHouseholdId } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { RESOURCE_STORAGE_BUCKET, chunkStoragePaths } from "@/lib/resource-storage";

type Context = { params: Promise<{ resourceId: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { resourceId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let householdId: string;
  try { householdId = await getCurrentHouseholdId(supabase, auth.user.id); } catch { return NextResponse.json({ error: "Household membership required." }, { status: 403 }); }
  const { data: resource, error: resourceError } = await supabase.from("resources").select("id, storage_cleanup_pending").eq("id", resourceId).eq("household_id", householdId).single();
  if (resourceError || !resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  if (resource.storage_cleanup_pending) return NextResponse.json({ error: "Resource deletion is already pending; retry cleanup instead." }, { status: 409 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server cleanup is not configured." }, { status: 503 }); }
  const claim = await admin.from("resources").update({ storage_cleanup_pending: true }).eq("id", resourceId).eq("household_id", householdId).eq("storage_cleanup_pending", false).select("id").single();
  if (claim.error || !claim.data) return NextResponse.json({ error: "Unable to claim the resource for deletion. Retry the operation." }, { status: 409 });
  const { data: intents, error: intentsError } = await admin.from("resource_upload_intents").select("id, storage_path").eq("household_id", householdId).eq("resource_id", resourceId);
  if (intentsError) return NextResponse.json({ error: "Unable to inspect pending uploads. Retry the operation." }, { status: 502 });
  if (intents?.length) {
    const job = await admin.from("resource_storage_cleanup_jobs").insert({ household_id: householdId, resource_id: resourceId, attachment_ids: [], storage_paths: intents.map((intent) => intent.storage_path), reason: "upload_rollback" }).select("id").single();
    if (job.error || !job.data) return NextResponse.json({ error: "Unable to schedule pending-upload cleanup. Retry the operation." }, { status: 502 });
    const { error: intentDeleteError } = await admin.from("resource_upload_intents").delete().eq("household_id", householdId).eq("resource_id", resourceId).in("id", intents.map((intent) => intent.id));
    if (intentDeleteError) return NextResponse.json({ error: "Unable to finalize pending-upload cleanup. Retry the operation." }, { status: 502 });
  }
  const { data: attachments, error: attachmentError } = await supabase.from("attachments").select("storage_path").eq("household_id", householdId).eq("parent_type", "resource").eq("parent_id", resourceId);
  if (attachmentError) return NextResponse.json({ error: "Unable to inspect resource attachments." }, { status: 500 });
  const paths = [...(attachments || []).map((attachment) => attachment.storage_path), ...(intents || []).map((intent) => intent.storage_path)];
  if (paths.length) {
    for (const chunk of chunkStoragePaths(paths, 100)) {
      const storage = await supabase.storage.from(RESOURCE_STORAGE_BUCKET).remove(chunk);
      if (storage.error) return NextResponse.json({ error: "Unable to remove resource files. The resource remains marked for deletion; retry the operation." }, { status: 502 });
    }
  }
  const { error: deleteError } = await admin.from("resources").delete().eq("id", resourceId).eq("household_id", householdId);
  if (deleteError) return NextResponse.json({ error: "Stored files were removed, but the resource could not be deleted. Retry the operation." }, { status: 502 });
  return NextResponse.json({ deleted: resourceId });
}
