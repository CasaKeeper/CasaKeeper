import assert from "node:assert/strict";
import test from "node:test";
import { displayNameLimit, validateDisplayName } from "./profile.ts";

test("validates display names without storing surrounding whitespace", () => {
  assert.equal(validateDisplayName("  Joey  "), "Joey");
  assert.equal(validateDisplayName("   "), null);
  assert.equal(validateDisplayName("x".repeat(displayNameLimit + 1)), null);
  assert.equal(validateDisplayName("x".repeat(displayNameLimit)), "x".repeat(displayNameLimit));
});
