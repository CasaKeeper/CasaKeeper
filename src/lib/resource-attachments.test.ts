import assert from "node:assert/strict";
import test from "node:test";
import { attachmentsMissingResourceType, removedResourceLinkIds } from "./resource-attachments.ts";

test("requires a valid Resource Type for each new attachment", () => {
  const missing = attachmentsMissingResourceType([{ id: "new", file: {} }, { id: "typed", file: {}, resourceTypeId: "type-a" }], new Set(["type-a"]));
  assert.deepEqual(missing, ["new"]);
});

test("removes associations without selecting Resources for deletion", () => {
  assert.deepEqual(removedResourceLinkIds([{ id: "a", resourceLinkId: "link-a" }, { id: "b", resourceLinkId: "link-b" }], [{ id: "a", resourceLinkId: "link-a" }]), ["link-b"]);
});
