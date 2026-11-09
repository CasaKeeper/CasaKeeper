import { NextResponse } from "next/server";
import { getAuthorizedAttachmentParent } from "@/lib/supabase/resource-access";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { RESOURCE_STORAGE_BUCKET } from "@/lib/resource-storage";

type Context = { params: Promise<{ attachmentId: string }> };

export async function DELETE(request: Request, context: Context) {
  const { attachmentId } = await context.params;
  const url = new URL(request.url);
  const parentType = url.searchParams.get("parentType");
  const parentId = url.searchParams.get("parentId") || "";
  if (parentType !== "task" && parentType !== "routine") return NextResponse.json({ error: "A valid attachment parent is required." }, { status: 400 });
  const access = await getAuthorizedAttachmentParent(parentType, parentId);
  if ("response" in access) return access.response;
  const { data: attachment, error } = await access.supabase.from("attachments").select("id, storage_path").eq("id", attachmentId).eq("household_id", access.householdId).eq("parent_type", parentType).eq("parent_id", parentId).single();
  if (error || !attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const admin = createSupabaseServiceClient();
  const removed = await admin.storage.from(RESOURCE_STORAGE_BUCKET).remove([attachment.storage_path]);
  if (removed.error) return NextResponse.json({ error: "The file could not be removed. Retry the operation." }, { status: 502 });
  const deleted = await access.supabase.from("attachments").delete().eq("id", attachmentId).eq("household_id", access.householdId).eq("parent_type", parentType).eq("parent_id", parentId);
  if (deleted.error) return NextResponse.json({ error: "The file was removed from Storage, but its metadata could not be removed." }, { status: 502 });
  return NextResponse.json({ deleted: attachmentId });
}
