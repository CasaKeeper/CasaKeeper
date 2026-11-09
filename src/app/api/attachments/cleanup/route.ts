import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentHouseholdId } from "@/lib/supabase/auth";
import { RESOURCE_STORAGE_BUCKET } from "@/lib/resource-storage";

export async function POST(request: Request) {
  let body: { intentIds?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid cleanup request." }, { status: 400 }); }
  const intentIds = Array.isArray(body.intentIds) ? body.intentIds.filter((id): id is string => typeof id === "string") : [];
  if (!intentIds.length || intentIds.length > 10) return NextResponse.json({ error: "Cleanup intents are required." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let householdId: string;
  try { householdId = await getCurrentHouseholdId(supabase, auth.user.id); } catch { return NextResponse.json({ error: "Household membership required." }, { status: 403 }); }
  const admin = createSupabaseServiceClient();
  const { data: intents, error } = await admin.from("resource_upload_intents").select("id, household_id, parent_type, parent_id, storage_path, finalized_at").in("id", intentIds).eq("household_id", householdId).is("finalized_at", null);
  if (error) return NextResponse.json({ error: "Unable to inspect upload cleanup." }, { status: 500 });
  for (const intent of intents || []) {
    const removed = await admin.storage.from(RESOURCE_STORAGE_BUCKET).remove([intent.storage_path]);
    if (removed.error) return NextResponse.json({ error: "Some uploaded files could not be cleaned up. Retry cleanup." }, { status: 502 });
    const deleted = await admin.from("resource_upload_intents").delete().eq("id", intent.id).eq("household_id", householdId).is("finalized_at", null);
    if (deleted.error) return NextResponse.json({ error: "Some upload authorizations could not be cleaned up. Retry cleanup." }, { status: 502 });
  }
  return NextResponse.json({ cleaned: (intents || []).map((intent) => intent.id) });
}
