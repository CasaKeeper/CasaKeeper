import assert from "node:assert/strict";
import test from "node:test";
import { householdErrorMessage, validateHouseholdName } from "./household.ts";

test("validates and trims household names", () => {
  assert.equal(validateHouseholdName("  Miller home  "), "Miller home");
  assert.equal(validateHouseholdName("   "), null);
  assert.equal(validateHouseholdName("a".repeat(121)), null);
});

test("maps invitation and duplicate-household failures to safe messages", () => {
  assert.equal(householdErrorMessage(new Error("invalid or expired invitation"), "join"), "That invitation is invalid, expired, revoked, or already used.");
  assert.equal(householdErrorMessage(new Error("user already belongs to a household"), "create"), "This account already belongs to a household.");
  assert.equal(householdErrorMessage(new Error("database detail"), "create"), "We could not create the household. Check the name and try again.");
});
