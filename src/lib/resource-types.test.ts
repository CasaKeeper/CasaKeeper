import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RESOURCE_TYPE_NAMES, hasDuplicateResourceTypeName, normalizeResourceTypeName } from "./resource-types.ts";

test("keeps the twelve standard names stable", () => {
    assert.equal(DEFAULT_RESOURCE_TYPE_NAMES.length, 12);
    assert.ok(DEFAULT_RESOURCE_TYPE_NAMES.includes("Other"));
  });

test("normalizes whitespace and compares names case-insensitively", () => {
    assert.equal(normalizeResourceTypeName("  Home   Systems "), "Home Systems");
    assert.equal(hasDuplicateResourceTypeName([{ id: "1", name: "Home Systems" }], " home   systems "), true);
    assert.equal(hasDuplicateResourceTypeName([{ id: "1", name: "Home Systems" }], "Home Systems", "1"), false);
});
