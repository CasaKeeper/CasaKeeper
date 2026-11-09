import { NextResponse } from "next/server";
import { getAuthorizedResource } from "@/lib/supabase/resource-access";
import { RESOURCE_SIGNED_URL_SECONDS, RESOURCE_STORAGE_BUCKET } from "@/lib/resource-storage";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Context = { params: Promise<{ resourceId: string }> };

export async function GET(_request: Request, context: Context) {
  const { resourceId } = await context.params;
  const access = await getAuthorizedResource(resourceId);
  if ("response" in access) return access.response;
  const { data: attachments, error } = await access.supabase.from("attachments").select("id, parent_id, original_filename, mime_type, file_size, storage_path, created_at").eq("household_id", access.householdId).eq("parent_type", "resource").eq("parent_id", resourceId).order("created_at");
  if (error) return NextResponse.json({ error: "Unable to load attachments." }, { status: 500 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Server attachment access is not configured." }, { status: 503 }); }
  const result = [];
  for (const attachment of attachments || []) {
    const signed = await admin.storage.from(RESOURCE_STORAGE_BUCKET).createSignedUrl(attachment.storage_path, RESOURCE_SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Unable to create an attachment link." }, { status: 502 });
    result.push({ ...attachment, signedUrl: signed.data.signedUrl });
  }
  return NextResponse.json({ attachments: result, expiresIn: RESOURCE_SIGNED_URL_SECONDS });
}

export async function POST() {
  return NextResponse.json({ error: "Use the upload-url and finalize endpoints; file bytes must be sent directly to Supabase Storage." }, { status: 410 });
}
