import assert from "node:assert/strict";
import test from "node:test";
import { ITEM_TYPES, itemType, validItemType } from "./item-types.ts";

test("exposes the six approved preset types and exact visual assignments", () => {
  assert.equal(ITEM_TYPES.length, 6);
  assert.deepEqual(itemType("plumbing"), { value: "plumbing", label: "Plumbing Work", icon: "droplet", color: "#2685DA" });
  assert.equal(itemType(null), null);
});

test("validates optional types while allowing no type", () => {
  assert.equal(validItemType(null), true);
  assert.equal(validItemType("electrical"), true);
  assert.equal(validItemType("unknown"), false);
});
