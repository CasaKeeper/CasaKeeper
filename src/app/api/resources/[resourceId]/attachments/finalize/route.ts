import { NextResponse } from "next/server";
import { getAuthorizedResource } from "@/lib/supabase/resource-access";
import { matchesAuthorizedStoredMime, RESOURCE_SIGNED_URL_SECONDS, RESOURCE_STORAGE_BUCKET, storageInfoMime } from "@/lib/resource-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Context = { params: Promise<{ resourceId: string }> };

export async function POST(request: Request, context: Context) {
  const { resourceId } = await context.params;
  const access = await getAuthorizedResource(resourceId);
  if ("response" in access) return access.response;
  let body: { intentId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid finalize request." }, { status: 400 }); }
  const intentId = typeof body.intentId === "string" ? body.intentId : "";
  if (!intentId) return NextResponse.json({ error: "Upload authorization is required." }, { status: 400 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server upload finalization is not configured." }, { status: 503 }); }
  const { data: intent, error: intentError } = await admin.from("resource_upload_intents").select("id, attachment_id, storage_path, original_filename, mime_type, file_size, expires_at, finalized_at").eq("id", intentId).eq("household_id", access.householdId).eq("resource_id", resourceId).single();
  if (intentError || !intent) return NextResponse.json({ error: "Upload authorization was not found or has expired." }, { status: 404 });
  if (intent.finalized_at) return NextResponse.json({ error: "This upload was already finalized." }, { status: 409 });
  if (new Date(intent.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Upload authorization has expired." }, { status: 410 });
  const { data: resource } = await admin.from("resources").select("id, household_id, storage_cleanup_pending").eq("id", resourceId).eq("household_id", access.householdId).single();
  if (!resource || resource.storage_cleanup_pending) return NextResponse.json({ error: "This Resource is no longer available for uploads." }, { status: 409 });
  const { data: stored, error: infoError } = await admin.storage.from(RESOURCE_STORAGE_BUCKET).info(intent.storage_path);
  if (infoError || !stored) return NextResponse.json({ error: "The uploaded file could not be verified." }, { status: 400 });
  const storedSize = Number((stored as { size?: number }).size);
  if (!Number.isSafeInteger(storedSize) || storedSize !== intent.file_size || !matchesAuthorizedStoredMime(storageInfoMime(stored), intent.mime_type)) return NextResponse.json({ error: "The uploaded file did not match its authorization." }, { status: 422 });
  const { data: metadataResult, error: finalizeError } = await access.supabase.rpc("finalize_resource_upload", { p_intent_id: intentId });
  const metadata = Array.isArray(metadataResult) ? metadataResult[0] : metadataResult;
  if (finalizeError || !metadata) return NextResponse.json({ error: "The upload could not be finalized. Retry the operation or cleanup." }, { status: 502 });
  const { data: signed } = await access.supabase.storage.from(RESOURCE_STORAGE_BUCKET).createSignedUrl(intent.storage_path, RESOURCE_SIGNED_URL_SECONDS);
  if (!signed?.signedUrl) return NextResponse.json({ error: "Attachment saved, but its preview link could not be created." }, { status: 502 });
  await admin.from("resource_upload_intents").delete().eq("id", intentId).eq("household_id", access.householdId);
  return NextResponse.json({ attachment: { ...metadata, signedUrl: signed.signedUrl }, expiresIn: RESOURCE_SIGNED_URL_SECONDS }, { status: 201 });
}
