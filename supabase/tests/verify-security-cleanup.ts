import { strict as assert } from "node:assert";

const projectRef = "jhkwxqlvxwzxgmhtzpix";
const expectedUrl = `https://${projectRef}.supabase.co`;
const pageSize = 1000;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let incomplete = false;

function decodeJwtRef(key: string): string | undefined {
  const payload = key.split(".")[1];
  if (!payload) return undefined;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).ref; } catch { return undefined; }
}

function headers() {
  return { apikey: serviceRoleKey as string, Authorization: `Bearer ${serviceRoleKey}` };
}

function orderColumn(table: string) {
  if (table === "household_members") return "joined_at";
  if (table === "routine_completions") return "completed_at";
  return "created_at";
}

async function restPage(table: string, select: string, offset: number) {
  const endpoint = new URL(`/rest/v1/${table}`, expectedUrl);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("order", `${orderColumn(table)}.asc`);
  const response = await fetch(endpoint, { headers: { ...headers(), Range: `${offset}-${offset + pageSize - 1}`, Prefer: "count=exact" } });
  if (!response.ok) throw new Error(`REST ${table} returned HTTP ${response.status}`);
  const data = await response.json() as unknown[];
  return data;
}

async function allRest(table: string, select: string) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await restPage(table, select, offset);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function authUsersPage(page: number) {
  const endpoint = new URL("/auth/v1/admin/users", expectedUrl);
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("per_page", String(pageSize));
  const response = await fetch(endpoint, { headers: headers() });
  if (!response.ok) throw new Error(`Auth Admin users returned HTTP ${response.status}`);
  const body = await response.json() as { users?: Array<{ id: string; email?: string; created_at?: string }> };
  return body.users || [];
}

async function allAuthUsers() {
  const users: Array<{ id: string; email?: string; created_at?: string }> = [];
  for (let page = 1; ; page += 1) {
    const batch = await authUsersPage(page);
    users.push(...batch);
    if (batch.length < pageSize) return users;
  }
}

async function main() {
  assert.equal(url, expectedUrl, "NEXT_PUBLIC_SUPABASE_URL does not target CasaKeeper");
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is missing");
  assert.equal(decodeJwtRef(serviceRoleKey as string), projectRef, "service-role JWT project reference does not match CasaKeeper");
  console.log(`Target verified: CasaKeeper (${projectRef})`);
  console.log("Read-only inspection started; no remote mutations are performed.");

  const households = (await allRest("households", "id,name,created_by,created_at") as Array<{ id: string; name: string; created_by: string; created_at: string }>).filter((household) => /^Security [AB] /.test(household.name));
  console.log(`Security-test household matches: ${households.length}`);
  for (const household of households) {
    console.log(`Household id=${household.id} name=${household.name} created_by=${household.created_by} created_at=${household.created_at}`);
    const relatedTables: Array<[string, string]> = [
      ["household_members", "id,household_id,user_id,role,joined_at"],
      ["household_invitations", "id,household_id,invited_by,accepted_by,expires_at,revoked_at,accepted_at,created_at"],
      ["tasks", "id,household_id,title,created_at"],
      ["routines", "id,household_id,title,created_at"],
      ["routine_completions", "id,household_id,routine_id,scheduled_date"],
      ["wishlist_items", "id,household_id,title,created_at"],
      ["resources", "id,household_id,title,created_at"],
      ["attachments", "id,household_id,parent_type,parent_id,original_filename,created_at"],
    ];
    for (const [table, select] of relatedTables) {
      const rows = await allRest(table, select);
      const related = (rows as Array<{ household_id?: string }>).filter((row) => row.household_id === household.id);
      console.log(`  ${table}: ${related.length}`);
      for (const row of related) console.log(`    ${JSON.stringify(row)}`);
    }
  }

  const authUsers = (await allAuthUsers()).filter((user) => (user.email || "").startsWith("casakeeper-security-"));
  console.log(`Disposable Auth user matches: ${authUsers.length}`);
  for (const user of authUsers) console.log(`  user id=${user.id} email=${user.email || ""} created_at=${user.created_at || ""}`);
  if (!households.length && !authUsers.length) console.log("No suspected security-test records found.");
}

try {
  await main();
} catch (error) {
  incomplete = true;
  console.error(`Inspection incomplete: ${error instanceof Error ? error.message : "request failed"}`);
}

if (incomplete) {
  console.error("Database cleanliness was not determined because one or more read-only checks failed.");
  process.exitCode = 1;
}
