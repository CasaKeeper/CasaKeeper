import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { RESOURCE_STORAGE_BUCKET } from "@/lib/resource-storage";

const BATCH_SIZE = 100;
const LOCK_SECONDS = 10 * 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server cleanup is not configured." }, { status: 503 }); }
  const now = new Date();
  const nowIso = now.toISOString();
  const lockIso = new Date(now.getTime() + LOCK_SECONDS * 1000).toISOString();
  const { data: candidates, error } = await admin.from("resource_upload_intents").select("id, household_id, resource_id, attachment_id, storage_path").is("finalized_at", null).lt("expires_at", nowIso).or(`cleanup_locked_until.is.null,cleanup_locked_until.lt.${nowIso}`).order("expires_at").limit(BATCH_SIZE);
  if (error) return NextResponse.json({ error: "Unable to load expired upload intents." }, { status: 500 });
  let cleaned = 0;
  let repaired = 0;
  let failed = 0;
  for (const candidate of candidates || []) {
    const { data: intent, error: claimError } = await admin.from("resource_upload_intents").update({ cleanup_locked_until: lockIso }).eq("id", candidate.id).is("finalized_at", null).or(`cleanup_locked_until.is.null,cleanup_locked_until.lt.${nowIso}`).select("id, household_id, resource_id, attachment_id, storage_path").maybeSingle();
    if (claimError || !intent) continue;
    const { data: matchingAttachment } = await admin.from("attachments").select("id").eq("id", intent.attachment_id).eq("household_id", intent.household_id).eq("parent_type", "resource").eq("parent_id", intent.resource_id).eq("storage_path", intent.storage_path).maybeSingle();
    if (matchingAttachment) {
      const { error: repairError } = await admin.from("resource_upload_intents").update({ finalized_at: new Date().toISOString(), cleanup_locked_until: null }).eq("id", intent.id).eq("household_id", intent.household_id).is("finalized_at", null);
      if (repairError) { failed++; console.error("Resource upload intent repair failed", { intentId: intent.id }); } else repaired++;
      continue;
    }
    const job = await admin.from("resource_storage_cleanup_jobs").insert({ household_id: intent.household_id, resource_id: intent.resource_id, attachment_ids: [], storage_paths: [intent.storage_path], reason: "upload_rollback" }).select("id").single();
    if (job.error || !job.data) { failed++; console.error("Resource upload cleanup job creation failed", { intentId: intent.id }); continue; }
    const info = await admin.storage.from(RESOURCE_STORAGE_BUCKET).info(intent.storage_path);
    const missing = info.error && String((info.error as { statusCode?: unknown }).statusCode) === "404";
    const removal = missing ? { error: null } : info.error ? { error: info.error } : await admin.storage.from(RESOURCE_STORAGE_BUCKET).remove([intent.storage_path]);
    if (removal.error) {
      failed++;
      await admin.from("resource_storage_cleanup_jobs").update({ last_error: "Storage cleanup failed; retry required.", updated_at: new Date().toISOString() }).eq("id", job.data.id).eq("household_id", intent.household_id);
      await admin.from("resource_upload_intents").update({ cleanup_locked_until: null }).eq("id", intent.id).eq("household_id", intent.household_id).is("finalized_at", null);
      console.error("Resource upload cleanup failed", { intentId: intent.id, jobId: job.data.id });
      continue;
    }
    const { error: intentDeleteError } = await admin.from("resource_upload_intents").delete().eq("id", intent.id).eq("household_id", intent.household_id).is("finalized_at", null);
    if (intentDeleteError) { failed++; console.error("Resource upload intent deletion failed", { intentId: intent.id, jobId: job.data.id }); continue; }
    await admin.from("resource_storage_cleanup_jobs").delete().eq("id", job.data.id).eq("household_id", intent.household_id);
    cleaned++;
  }
  return NextResponse.json({ processed: (candidates || []).length, cleaned, repaired, failed });
}
