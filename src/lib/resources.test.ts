import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResourceNotes, validResourceLinks } from "./resources.ts";

test("resource notes preserve order while normalizing legacy text", () => {
  assert.deepEqual(normalizeResourceNotes(" First note\n\nSecond note "), ["First note", "Second note"]);
  assert.deepEqual(normalizeResourceNotes(["One", " Two "]), ["One", "Two"]);
});

test("resource links accept only HTTP and HTTPS URLs", () => {
  assert.equal(validResourceLinks(["https://example.com", "http://manual.test"]), true);
  assert.equal(validResourceLinks(["ftp://example.com"]), false);
});
