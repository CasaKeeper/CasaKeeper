import { NextResponse } from "next/server";
import { getAuthorizedAttachmentParent, type AttachmentParentType } from "@/lib/supabase/resource-access";
import { RESOURCE_STORAGE_BUCKET, RESOURCE_UPLOAD_INTENT_SECONDS, MAX_RESOURCE_FILE_BYTES, canonicalResourceMime, parentAttachmentStoragePath, safeResourceFilename } from "@/lib/resource-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const parentTypes = new Set<AttachmentParentType>(["task", "routine"]);

export async function POST(request: Request) {
  let body: { parentType?: unknown; parentId?: unknown; filename?: unknown; fileSize?: unknown; mimeType?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid upload request." }, { status: 400 }); }
  const parentType = typeof body.parentType === "string" && parentTypes.has(body.parentType as AttachmentParentType) ? body.parentType as "task" | "routine" : null;
  const parentId = typeof body.parentId === "string" ? body.parentId : "";
  if (!parentType || !parentId) return NextResponse.json({ error: "A valid attachment parent is required." }, { status: 400 });
  const access = await getAuthorizedAttachmentParent(parentType, parentId);
  if ("response" in access) return access.response;
  const originalFilename = typeof body.filename === "string" ? body.filename : "";
  const filename = safeResourceFilename(originalFilename);
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : NaN;
  const mimeType = typeof body.mimeType === "string" ? canonicalResourceMime(originalFilename, body.mimeType) : null;
  if (!filename || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_RESOURCE_FILE_BYTES || !mimeType) return NextResponse.json({ error: "The file name, size, or type is not supported." }, { status: 415 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server upload authorization is not configured." }, { status: 503 }); }
  const attachmentId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const storagePath = parentAttachmentStoragePath(access.householdId, parentType, parentId, attachmentId, filename);
  const expiresAt = new Date(Date.now() + RESOURCE_UPLOAD_INTENT_SECONDS * 1000).toISOString();
  const { error } = await admin.from("resource_upload_intents").insert({ id: intentId, household_id: access.householdId, resource_id: null, parent_type: parentType, parent_id: parentId, attachment_id: attachmentId, storage_path: storagePath, original_filename: originalFilename, mime_type: mimeType, file_size: fileSize, expires_at: expiresAt });
  if (error) return NextResponse.json({ error: "Unable to prepare the upload." }, { status: 500 });
  const { data: signed, error: signedError } = await access.supabase.storage.from(RESOURCE_STORAGE_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (signedError || !signed?.token) {
    await admin.from("resource_upload_intents").delete().eq("id", intentId).eq("household_id", access.householdId);
    return NextResponse.json({ error: "Unable to authorize the upload." }, { status: 502 });
  }
  return NextResponse.json({ intentId, path: storagePath, token: signed.token, mimeType, expiresAt });
}
