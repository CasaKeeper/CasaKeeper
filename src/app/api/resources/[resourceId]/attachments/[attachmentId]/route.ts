import { NextResponse } from "next/server";
import { getCurrentHouseholdId } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { RESOURCE_STORAGE_BUCKET } from "@/lib/resource-storage";

type Context = { params: Promise<{ resourceId: string; attachmentId: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { resourceId, attachmentId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let householdId: string;
  try { householdId = await getCurrentHouseholdId(supabase, auth.user.id); } catch { return NextResponse.json({ error: "Household membership required." }, { status: 403 }); }
  const { data: attachment, error: lookupError } = await supabase.from("attachments").select("id, storage_path").eq("id", attachmentId).eq("household_id", householdId).eq("parent_type", "resource").eq("parent_id", resourceId).single();
  if (lookupError || !attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const storage = await supabase.storage.from(RESOURCE_STORAGE_BUCKET).remove([attachment.storage_path]);
  if (storage.error) return NextResponse.json({ error: "Unable to remove the stored file. Metadata was retained so the operation can be retried." }, { status: 502 });
  let admin;
  try { admin = createSupabaseServiceClient(); } catch { return NextResponse.json({ error: "Stored file removed, but server cleanup is not configured; retry cleanup." }, { status: 503 }); }
  const { error: metadataError } = await admin.from("attachments").delete().eq("id", attachmentId).eq("household_id", householdId).eq("parent_type", "resource").eq("parent_id", resourceId);
  if (metadataError) return NextResponse.json({ error: "Stored file removed, but attachment metadata cleanup failed; retry cleanup." }, { status: 502 });
  return NextResponse.json({ deleted: attachmentId });
}
