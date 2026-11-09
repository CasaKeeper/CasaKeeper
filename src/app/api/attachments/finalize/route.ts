import { NextResponse } from "next/server";
import { getAuthorizedAttachmentParent, type AttachmentParentType } from "@/lib/supabase/resource-access";
import { matchesAuthorizedStoredMime, RESOURCE_SIGNED_URL_SECONDS, RESOURCE_STORAGE_BUCKET, storageInfoMime } from "@/lib/resource-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  let body: { parentType?: unknown; parentId?: unknown; intentId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid finalize request." }, { status: 400 }); }
  const parentType = body.parentType === "task" || body.parentType === "routine" ? body.parentType as AttachmentParentType : null;
  const parentId = typeof body.parentId === "string" ? body.parentId : "";
  const intentId = typeof body.intentId === "string" ? body.intentId : "";
  if (!parentType || !parentId || !intentId) return NextResponse.json({ error: "Upload authorization is required." }, { status: 400 });
  const access = await getAuthorizedAttachmentParent(parentType, parentId);
  if ("response" in access) return access.response;
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server upload finalization is not configured." }, { status: 503 }); }
  const { data: intent, error } = await admin.from("resource_upload_intents").select("id, parent_type, parent_id, attachment_id, storage_path, original_filename, mime_type, file_size, expires_at, finalized_at").eq("id", intentId).eq("household_id", access.householdId).eq("parent_type", parentType).eq("parent_id", parentId).single();
  if (error || !intent) return NextResponse.json({ error: "Upload authorization was not found or has expired." }, { status: 404 });
  if (!intent.finalized_at && new Date(intent.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Upload authorization has expired." }, { status: 410 });
  const { data: stored, error: infoError } = await admin.storage.from(RESOURCE_STORAGE_BUCKET).info(intent.storage_path);
  const storedSize = Number((stored as { size?: number } | null)?.size);
  if (infoError || !stored || !Number.isSafeInteger(storedSize) || storedSize !== intent.file_size || !matchesAuthorizedStoredMime(storageInfoMime(stored), intent.mime_type)) return NextResponse.json({ error: "The uploaded file did not match its authorization." }, { status: 422 });
  const { data: metadataResult, error: finalizeError } = await access.supabase.rpc("finalize_resource_upload", { p_intent_id: intentId });
  const metadata = Array.isArray(metadataResult) ? metadataResult[0] : metadataResult;
  if (finalizeError || !metadata) return NextResponse.json({ error: "The upload could not be finalized. Retry the operation or cleanup." }, { status: 502 });
  const { data: signed } = await admin.storage.from(RESOURCE_STORAGE_BUCKET).createSignedUrl(intent.storage_path, RESOURCE_SIGNED_URL_SECONDS);
  if (!signed?.signedUrl) return NextResponse.json({ error: "Attachment saved, but its preview link could not be created." }, { status: 502 });
  await admin.from("resource_upload_intents").delete().eq("id", intentId).eq("household_id", access.householdId);
  return NextResponse.json({ attachment: { ...metadata, signedUrl: signed.signedUrl }, expiresIn: RESOURCE_SIGNED_URL_SECONDS }, { status: 201 });
}
