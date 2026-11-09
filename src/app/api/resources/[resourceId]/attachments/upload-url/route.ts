import { NextResponse } from "next/server";
import { getAuthorizedResource } from "@/lib/supabase/resource-access";
import { RESOURCE_UPLOAD_INTENT_SECONDS, RESOURCE_STORAGE_BUCKET, MAX_RESOURCE_FILE_BYTES, canonicalResourceMime, resourceStoragePath, safeResourceFilename } from "@/lib/resource-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Context = { params: Promise<{ resourceId: string }> };

export async function POST(request: Request, context: Context) {
  const { resourceId } = await context.params;
  const access = await getAuthorizedResource(resourceId);
  if ("response" in access) return access.response;
  let body: { filename?: unknown; fileSize?: unknown; mimeType?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid upload request." }, { status: 400 }); }
  const originalFilename = typeof body.filename === "string" ? body.filename : "";
  const filename = safeResourceFilename(originalFilename);
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : NaN;
  const mimeType = typeof body.mimeType === "string" ? canonicalResourceMime(originalFilename, body.mimeType) : null;
  if (!filename || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_RESOURCE_FILE_BYTES || !mimeType) {
    return NextResponse.json({ error: "The file name, size, or type is not supported." }, { status: 415 });
  }
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server upload authorization is not configured." }, { status: 503 }); }
  const attachmentId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const storagePath = resourceStoragePath(access.householdId, resourceId, attachmentId, filename);
  const expiresAt = new Date(Date.now() + RESOURCE_UPLOAD_INTENT_SECONDS * 1000).toISOString();
  const { error: intentError } = await admin.from("resource_upload_intents").insert({ id: intentId, household_id: access.householdId, resource_id: resourceId, parent_type: "resource", parent_id: resourceId, attachment_id: attachmentId, storage_path: storagePath, original_filename: originalFilename, mime_type: mimeType, file_size: fileSize, expires_at: expiresAt });
  if (intentError) return NextResponse.json({ error: "Unable to prepare the upload." }, { status: 500 });
  const { data: signed, error: signedError } = await access.supabase.storage.from(RESOURCE_STORAGE_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (signedError || !signed?.token) {
    await admin.from("resource_upload_intents").delete().eq("id", intentId).eq("household_id", access.householdId);
    return NextResponse.json({ error: "Unable to authorize the upload." }, { status: 502 });
  }
  return NextResponse.json({ intentId, path: storagePath, token: signed.token, mimeType, expiresAt });
}
