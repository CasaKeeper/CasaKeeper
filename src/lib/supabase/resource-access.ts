import { getCurrentHouseholdId } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthorizedResource(resourceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) } as const;
  let householdId: string;
  try { householdId = await getCurrentHouseholdId(supabase, auth.user.id); }
  catch { return { response: Response.json({ error: "Household membership required." }, { status: 403 }) } as const; }
  const { data: resource, error } = await supabase.from("resources").select("id, household_id, storage_cleanup_pending").eq("id", resourceId).eq("household_id", householdId).single();
  if (error || !resource) return { response: Response.json({ error: "Resource not found." }, { status: 404 }) } as const;
  if (resource.storage_cleanup_pending) return { response: Response.json({ error: "This resource is being deleted. Retry after cleanup completes." }, { status: 409 }) } as const;
  return { supabase, userId: auth.user.id, householdId, resource } as const;
}
