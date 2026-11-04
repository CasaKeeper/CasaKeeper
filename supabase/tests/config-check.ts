import { strict as assert } from "node:assert";

const projectRef = "jhkwxqlvxwzxgmhtzpix";
const expectedUrl = `https://${projectRef}.supabase.co`;
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CASEKEEPER_SECURITY_TEST_PASSWORD", "CASEKEEPER_RUN_REMOTE_SECURITY_TESTS"] as const;
const missing = required.filter((name) => !process.env[name]);
assert.deepEqual(missing, [], `missing required environment variables: ${missing.join(", ")}`);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, expectedUrl, "NEXT_PUBLIC_SUPABASE_URL does not target CasaKeeper");
assert.equal(process.env.CASEKEEPER_RUN_REMOTE_SECURITY_TESTS, "1", "CASEKEEPER_RUN_REMOTE_SECURITY_TESTS must equal 1 for live execution");
assert.ok((process.env.CASEKEEPER_SECURITY_TEST_PASSWORD as string).length >= 8, "test password is too short");
assert.match(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string, /^(sb_publishable_[A-Za-z0-9_-]+|ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/, "publishable key format is not recognized");
const serviceParts = (process.env.SUPABASE_SERVICE_ROLE_KEY as string).split(".");
assert.equal(serviceParts.length, 3, "service-role key is not a JWT that can be project-checked");
const servicePayload = JSON.parse(Buffer.from(serviceParts[1], "base64url").toString("utf8")) as { ref?: string };
assert.equal(servicePayload.ref, projectRef, "service-role key does not belong to CasaKeeper");
console.log("Supabase security-test configuration: valid");
console.log("Target project: CasaKeeper (project reference verified without printing credentials)");
