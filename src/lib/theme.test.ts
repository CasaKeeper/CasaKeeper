import test from "node:test";
import assert from "node:assert/strict";
import { getBrowserStorage, parseTheme, readStoredTheme, writeStoredTheme } from "./theme.ts";

test("restores only explicit stored theme values", () => {
  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("light"), "light");
  assert.equal(parseTheme("system"), "light");
  assert.equal(readStoredTheme({ getItem: () => "dark" }), "dark");
});

test("theme persistence handles unavailable storage safely", () => {
  assert.equal(getBrowserStorage(), undefined);
  assert.equal(readStoredTheme({ getItem: () => { throw new Error("blocked"); } }), "light");
  assert.doesNotThrow(() => writeStoredTheme("dark", { setItem: () => { throw new Error("blocked"); } }));
});
