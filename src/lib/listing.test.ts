import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortByTitle } from "./listing.ts";

test("filters titles case-insensitively and trims the query", () => {
  const result = filterAndSortByTitle([{ id: 1, title: " Kitchen Tasks " }, { id: 2, title: "Garden" }], "  KITCHEN  ", "asc", (item) => item.title);
  assert.deepEqual(result.map((item) => item.id), [1]);
});

test("sorts alphabetically in both directions without mutating input", () => {
  const items = [{ id: 2, title: "beta" }, { id: 1, title: "Alpha" }, { id: 3, title: "alpha" }];
  assert.deepEqual(filterAndSortByTitle(items, "", "asc", (item) => item.title).map((item) => item.id), [3, 1, 2]);
  assert.deepEqual(filterAndSortByTitle(items, "", "desc", (item) => item.title).map((item) => item.id), [2, 3, 1]);
  assert.deepEqual(items.map((item) => item.id), [2, 1, 3]);
});

test("returns an empty list when nothing matches", () => {
  assert.deepEqual(filterAndSortByTitle([{ title: "Tasks" }], "missing", "asc", (item) => item.title), []);
});
