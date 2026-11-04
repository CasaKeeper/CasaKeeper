import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "./redirects.ts";
import { isStrongPassword, isValidEmail } from "./validation.ts";

test("accepts only safe internal callback paths", () => {
  assert.equal(safeNextPath("/tasks"), "/tasks");
  assert.equal(safeNextPath("https://example.com"), "/");
  assert.equal(safeNextPath("//example.com"), "/");
  assert.equal(safeNextPath(undefined, "/onboarding"), "/onboarding");
});

test("validates email and password requirements locally", () => {
  assert.equal(isValidEmail("person@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isStrongPassword("CasaKeeper1"), true);
  assert.equal(isStrongPassword("short"), false);
});
