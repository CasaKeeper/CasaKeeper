import assert from "node:assert/strict";
import test from "node:test";
import { filterVisibleResources, normalizeResourceNotes, validResourceLinks } from "./resources.ts";

test("resource notes preserve order while normalizing legacy text", () => {
  assert.deepEqual(normalizeResourceNotes(" First note\n\nSecond note "), ["First note", "Second note"]);
  assert.deepEqual(normalizeResourceNotes(["One", " Two "]), ["One", "Two"]);
});

test("resource links accept only HTTP and HTTPS URLs", () => {
  assert.equal(validResourceLinks(["https://example.com", "http://manual.test"]), true);
  assert.equal(validResourceLinks(["ftp://example.com"]), false);
});

test("keeps resource filtering and counts stable across repeated detail open/close derivations", () => {
  const resources = [
    { id: "2", title: "Zebra guide", resourceTypeId: "manuals" },
    { id: "1", title: "Alpha guide", resourceTypeId: "manuals" },
    { id: "3", title: "Alpha checklist", resourceTypeId: "other" },
  ];
  const visibleBeforeDetail = filterVisibleResources(resources, "guide", "asc", "manuals");
  const visibleAfterDetail = filterVisibleResources(resources, "guide", "asc", "manuals");
  assert.deepEqual(visibleAfterDetail.map((item) => item.id), visibleBeforeDetail.map((item) => item.id));
  assert.equal(visibleAfterDetail.length, 2);
  assert.deepEqual(resources.map((item) => item.id), ["2", "1", "3"]);
});
