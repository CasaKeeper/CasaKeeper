import { strict as assert } from "node:assert";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const projectRef = "jhkwxqlvxwzxgmhtzpix";
const expectedUrl = `https://${projectRef}.supabase.co`;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testPassword = process.env.CASEKEEPER_SECURITY_TEST_PASSWORD;
const enabled = process.env.CASEKEEPER_RUN_REMOTE_SECURITY_TESTS === "1";
const manifestRoot = "supabase/tests/.runs";

type TestUser = { id: string; email: string; client: SupabaseClient };
type RunManifest = { runId: string; projectRef: string; createdAt: string; userIds: string[]; householdIds: string[] };
type RunState = RunManifest & { manifestPath: string };

function decodeJwtRef(key: string): string | undefined {
  const payload = key.split(".")[1];
  if (!payload) return undefined;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).ref; } catch { return undefined; }
}

async function verifyDedicatedProject(admin: SupabaseClient) {
  assert.equal(supabaseUrl, expectedUrl, "security tests must target the dedicated CasaKeeper URL");
  assert.ok(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required only in local ignored configuration");
  assert.ok(testPassword, "CASEKEEPER_SECURITY_TEST_PASSWORD is required only in local ignored configuration");
  assert.equal(decodeJwtRef(serviceRoleKey as string), projectRef, "service-role key project identity could not be verified");
  const response = await fetch(`${expectedUrl}/rest/v1/`, { headers: { apikey: serviceRoleKey as string, Authorization: `Bearer ${serviceRoleKey}` } });
  assert.notEqual(response.status, 401, "administrative client was rejected by the expected project");
  assert.notEqual(response.status, 403, "administrative client was rejected by the expected project");
  const probe = await admin.from("profiles").select("id").limit(1);
  assert.ifError(probe.error);
}

async function persistManifest(state: RunState) {
  await mkdir(manifestRoot, { recursive: true });
  await writeFile(state.manifestPath, JSON.stringify({ runId: state.runId, projectRef: state.projectRef, createdAt: state.createdAt, userIds: state.userIds, householdIds: state.householdIds }, null, 2), "utf8");
}

async function cleanupRun(admin: SupabaseClient, state: RunState) {
  let failures: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const attemptFailures: string[] = [];
    for (const householdId of state.householdIds) {
      const result = await admin.from("households").delete().eq("id", householdId);
      if (result.error) attemptFailures.push(`household ${householdId}: ${result.error.message}`);
    }
    for (const userId of state.userIds) {
      const result = await admin.auth.admin.deleteUser(userId);
      if (result.error && !/not found|does not exist/i.test(result.error.message)) attemptFailures.push(`user ${userId}: ${result.error.message}`);
    }
    if (!attemptFailures.length) { await unlink(state.manifestPath).catch(() => undefined); return; }
    failures = attemptFailures;
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw new Error(`Security-test cleanup failed; retained manifest ${state.manifestPath}: ${failures.join(" | ")}`);
}

async function createTestUser(admin: SupabaseClient, state: RunState, label: string): Promise<TestUser> {
  const email = `casakeeper-security-${state.runId}-${label}-${randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password: testPassword as string, email_confirm: true });
  assert.ifError(created.error); assert.ok(created.data.user);
  state.userIds.push(created.data.user.id); await persistManifest(state);
  const client = createClient(supabaseUrl as string, publishableKey as string);
  const signIn = await client.auth.signInWithPassword({ email, password: testPassword as string });
  assert.ifError(signIn.error);
  return { id: created.data.user.id, email, client };
}

async function createHousehold(client: SupabaseClient, state: RunState, name: string) {
  const result = await client.rpc("create_household", { household_name: `${name} ${state.runId}` });
  assert.ifError(result.error); assert.ok(result.data?.id);
  state.householdIds.push(result.data.id); await persistManifest(state);
  return result.data as { id: string };
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.rpc(fn, args); assert.ifError(result.error); return result.data as T;
}

test("remote household security integration suite is explicitly opt-in", { skip: !enabled ? "Set CASEKEEPER_RUN_REMOTE_SECURITY_TESTS=1 to run against the dedicated development project." : false }, async () => {
  const state: RunState = { runId: randomUUID(), projectRef, createdAt: new Date().toISOString(), userIds: [], householdIds: [], manifestPath: `${manifestRoot}/${randomUUID()}.json` };
  const admin = createClient(supabaseUrl || expectedUrl, serviceRoleKey || "missing", { auth: { autoRefreshToken: false, persistSession: false } });
  await persistManifest(state);
  try {
    await verifyDedicatedProject(admin);
    const userA = await createTestUser(admin, state, "a");
    const userB = await createTestUser(admin, state, "b");
    const userC = await createTestUser(admin, state, "c");
    const userD = await createTestUser(admin, state, "d");
    const userE = await createTestUser(admin, state, "e");
    const userF = await createTestUser(admin, state, "f");
    const userG = await createTestUser(admin, state, "g");
    const householdA = await createHousehold(userA.client, state, "Security A");
    const householdB = await createHousehold(userB.client, state, "Security B");

    const ownProfile = await userA.client.from("profiles").select("id").eq("id", userA.id).single();
    assert.ifError(ownProfile.error); assert.equal(ownProfile.data.id, userA.id);
    const otherProfile = await userA.client.from("profiles").select("id").eq("id", userB.id);
    assert.ifError(otherProfile.error); assert.deepEqual(otherProfile.data, []);
    const forgedProfile = await userB.client.from("profiles").update({ display_name: "forged" }).eq("id", userA.id);
    assert.ifError(forgedProfile.error);
    const unchangedProfile = await userA.client.from("profiles").select("display_name").eq("id", userA.id).single();
    assert.ifError(unchangedProfile.error); assert.notEqual(unchangedProfile.data.display_name, "forged");
    const forgedMembership = await userB.client.from("household_members").insert({ household_id: householdA.id, user_id: userB.id, role: "owner" });
    assert.ok(forgedMembership.error);
    const roleBefore = await userB.client.from("household_members").select("role").eq("user_id", userB.id).single();
    assert.ifError(roleBefore.error);
    const roleChange = await userB.client.from("household_members").update({ role: "member" }).eq("user_id", userB.id).select("role");
    assert.ifError(roleChange.error); assert.deepEqual(roleChange.data, [], "membership role updates must be RLS no-ops");
    const roleAfter = await userB.client.from("household_members").select("role").eq("user_id", userB.id).single();
    assert.ifError(roleAfter.error); assert.equal(roleAfter.data.role, roleBefore.data.role);

    const invitation = await rpc<{ invitation_token: string }[]>(userA.client, "create_household_invitation", { target_household_id: householdA.id });
    const token = invitation[0].invitation_token; assert.ok(token);
    const storedToken = await admin.from("household_invitations").select("token_hash").eq("household_id", householdA.id).order("created_at", { ascending: false }).limit(1).single();
    assert.ifError(storedToken.error); assert.notEqual(String(storedToken.data.token_hash), token);
    const unauthorizedInvitation = await userB.client.rpc("create_household_invitation", { target_household_id: householdA.id });
    assert.ok(unauthorizedInvitation.error);
    const invitationRow = await admin.from("household_invitations").select("id").eq("household_id", householdA.id).order("created_at", { ascending: false }).limit(1).single();
    assert.ifError(invitationRow.error); assert.ok(invitationRow.data);
    const unauthorizedRevoke = await userB.client.rpc("revoke_household_invitation", { invitation_id: invitationRow.data.id });
    assert.ok(unauthorizedRevoke.error);
    const accepted = await rpc<{ id: string }>(userC.client, "accept_household_invitation", { raw_token: token }); assert.equal(accepted.id, householdA.id);
    const concurrentInvite = await rpc<{ invitation_token: string }[]>(userA.client, "create_household_invitation", { target_household_id: householdA.id });
    const concurrentResults = await Promise.all([userD.client.rpc("accept_household_invitation", { raw_token: concurrentInvite[0].invitation_token }), userE.client.rpc("accept_household_invitation", { raw_token: concurrentInvite[0].invitation_token })]);
    assert.equal(concurrentResults.filter((result) => !result.error).length, 1, "concurrent redemption must allow exactly one acceptance");
    const reused = await userF.client.rpc("accept_household_invitation", { raw_token: token }); assert.ok(reused.error);
    const invalid = await userF.client.rpc("accept_household_invitation", { raw_token: "invalid-token" }); assert.ok(invalid.error);
    const expiring = await rpc<{ invitation_token: string }[]>(userA.client, "create_household_invitation", { target_household_id: householdA.id, expires_at: new Date(Date.now() + 1_500).toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const expired = await userF.client.rpc("accept_household_invitation", { raw_token: expiring[0].invitation_token }); assert.ok(expired.error, "expired invitation redemption must be rejected");
    const expiredMembership = await userF.client.from("household_members").select("id").eq("user_id", userF.id);
    assert.ifError(expiredMembership.error); assert.deepEqual(expiredMembership.data, [], "expired invitation must not create membership");
    const revoked = await rpc<{ invitation_token: string }[]>(userA.client, "create_household_invitation", { target_household_id: householdA.id });
    const revokedRow = await admin.from("household_invitations").select("id").eq("household_id", householdA.id).order("created_at", { ascending: false }).limit(1).single();
    assert.ifError(revokedRow.error); await rpc<void>(userA.client, "revoke_household_invitation", { invitation_id: revokedRow.data.id });
    const revokedResult = await userG.client.rpc("accept_household_invitation", { raw_token: revoked[0].invitation_token }); assert.ok(revokedResult.error);

    const task = await userA.client.from("tasks").insert({ household_id: householdA.id, title: `task-${state.runId}` }).select("id").single(); assert.ifError(task.error);
    const routine = await userA.client.from("routines").insert({ household_id: householdA.id, title: `routine-${state.runId}`, start_date: "2026-01-01", frequency_config: { type: "daily", mode: "interval", interval: 1 } }).select("id").single(); assert.ifError(routine.error);
    const wishlist = await userA.client.from("wishlist_items").insert({ household_id: householdA.id, title: `wishlist-${state.runId}` }).select("id").single(); assert.ifError(wishlist.error);
    const resource = await userA.client.from("resources").insert({ household_id: householdA.id, title: `resource-${state.runId}` }).select("id").single(); assert.ifError(resource.error);
    const attachment = await userA.client.from("attachments").insert({ household_id: householdA.id, parent_type: "resource", parent_id: resource.data.id, original_filename: "security.txt", mime_type: "text/plain", file_size: 1, storage_path: `security/${state.runId}/security.txt` }); assert.ifError(attachment.error);
    const unauthenticated = createClient(supabaseUrl as string, publishableKey as string);
    for (const table of ["tasks", "routines", "routine_completions", "wishlist_items", "resources", "attachments"]) {
      const result = await unauthenticated.from(table).select("id"); assert.ifError(result.error); assert.deepEqual(result.data, [], `anonymous access denied for ${table}`);
    }
    const memberRead = await userC.client.from("tasks").select("id").eq("id", task.data.id); assert.ifError(memberRead.error); assert.equal(memberRead.data.length, 1);
    const memberUpdate = await userC.client.from("tasks").update({ description: "member update" }).eq("id", task.data.id).select("id,description"); assert.ifError(memberUpdate.error); assert.equal(memberUpdate.data.length, 1); assert.equal(memberUpdate.data[0].description, "member update");
    const memberDelete = await userC.client.from("wishlist_items").delete().eq("id", wishlist.data.id).select("id"); assert.ifError(memberDelete.error); assert.equal(memberDelete.data.length, 1);
    const crossTables = ["tasks", "routines", "wishlist_items", "resources", "attachments"] as const;
    for (const table of crossTables) {
      const read = await userB.client.from(table).select("id").eq("household_id", householdA.id); assert.ifError(read.error); assert.deepEqual(read.data, [], `cross-household read denied for ${table}`);
      const update = await userB.client.from(table).update({ household_id: householdB.id }).eq("household_id", householdA.id).select("id"); assert.ifError(update.error); assert.deepEqual(update.data, [], `cross-household update denied for ${table}`);
      const remove = await userB.client.from(table).delete().eq("household_id", householdA.id).select("id"); assert.ifError(remove.error); assert.deepEqual(remove.data, [], `cross-household delete denied for ${table}`);
    }
    const forgedTask = await userB.client.from("tasks").insert({ household_id: householdA.id, title: "forged" }); assert.ok(forgedTask.error);
    const foreignCompletion = await userB.client.from("routine_completions").insert({ household_id: householdB.id, routine_id: routine.data.id, scheduled_date: "2026-01-01" }); assert.ok(foreignCompletion.error);
    const foreignAttachment = await userB.client.from("attachments").insert({ household_id: householdB.id, parent_type: "resource", parent_id: resource.data.id, original_filename: "x.txt", mime_type: "text/plain", file_size: 1, storage_path: "x" }); assert.ok(foreignAttachment.error);
    const deletedResource = await userA.client.from("resources").delete().eq("id", resource.data.id); assert.ifError(deletedResource.error);
    const cleaned = await userA.client.from("attachments").select("id").eq("parent_id", resource.data.id); assert.ifError(cleaned.error); assert.deepEqual(cleaned.data, []);
  } finally {
    await cleanupRun(admin, state);
  }
});

export async function cleanupFromManifest(manifestPath: string) {
  assert.equal(process.env.CASEKEEPER_RUN_REMOTE_SECURITY_CLEANUP, "1", "set CASEKEEPER_RUN_REMOTE_SECURITY_CLEANUP=1 to enable cleanup");
  assert.equal(supabaseUrl, expectedUrl, "cleanup must target the dedicated CasaKeeper URL");
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");
  assert.equal(decodeJwtRef(serviceRoleKey), projectRef, "service-role key project identity could not be verified");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RunManifest;
  assert.equal(manifest.projectRef, projectRef);
  const admin = createClient(expectedUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await cleanupRun(admin, { ...manifest, manifestPath });
}
