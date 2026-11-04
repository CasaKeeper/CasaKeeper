import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";

export type HouseholdContext = {
  id: string;
  name: string;
  currentMemberId: string;
  userId: string;
  displayName: string | null;
  role: "owner" | "member";
  members: Array<{ id: string; role: "owner" | "member"; displayName: string | null }>;
  invitations: Array<{ id: string; expiresAt: string }>;
};

export async function getCurrentAuth() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: data.user, error };
}

export async function requireUser(nextPath: string) {
  const auth = await getCurrentAuth();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return auth as typeof auth & { user: NonNullable<typeof auth.user> };
}

export async function hasHousehold(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data, error } = await supabase.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.household_id);
}

export async function getCurrentHouseholdId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data, error } = await supabase.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (error || !data?.household_id) throw error || new Error("Household membership was not found.");
  return data.household_id as string;
}

export async function requireHousehold(nextPath: string) {
  const auth = await requireUser(nextPath);
  if (!(await hasHousehold(auth.supabase, auth.user.id))) redirect("/onboarding");
  return auth;
}

export async function getHouseholdContext(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string): Promise<HouseholdContext> {
  const { data: membership, error: membershipError } = await supabase.from("household_members").select("id, household_id, role").eq("user_id", userId).maybeSingle();
  if (membershipError || !membership) throw membershipError || new Error("Household membership was not found.");
  const [{ data: household, error: householdError }, { data: members, error: membersError }, { data: invitations, error: invitationsError }] = await Promise.all([
    supabase.from("households").select("id, name").eq("id", membership.household_id).single(),
    supabase.from("household_members").select("id, user_id, role").eq("household_id", membership.household_id).order("joined_at"),
    supabase.from("household_invitations").select("id, expires_at").eq("household_id", membership.household_id).is("revoked_at", null).is("accepted_at", null).order("expires_at"),
  ]);
  if (householdError || membersError || invitationsError || !household || !members || !invitations) throw householdError || membersError || invitationsError || new Error("Unable to load household information.");
  const ids = members.map((member) => member.user_id);
  const { data: profiles, error: profilesError } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile.display_name]));
  return { id: household.id, name: household.name, currentMemberId: membership.id, userId, displayName: profileById.get(userId) || null, role: membership.role, members: members.map((member) => ({ id: member.id, role: member.role, displayName: profileById.get(member.user_id) || null })), invitations: invitations.map((invitation) => ({ id: invitation.id, expiresAt: invitation.expires_at })) };
}

export async function redirectAuthenticated(nextPath?: string | null) {
  const { supabase, user } = await getCurrentAuth();
  if (!user) return;
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") && !nextPath.includes("://")) redirect(nextPath);
  if (await hasHousehold(supabase, user.id)) redirect("/");
  redirect("/onboarding");
}
