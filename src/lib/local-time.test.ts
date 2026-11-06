import assert from "node:assert/strict";
import test from "node:test";
import { compareLocalTimes, formatLocalTime, normalizeLocalTime } from "./local-time.ts";

test("normalizes valid local wall-clock times and rejects invalid values", () => {
  assert.equal(normalizeLocalTime("15:00"), "15:00");
  assert.equal(normalizeLocalTime("24:00"), null);
  assert.equal(normalizeLocalTime("3:00"), null);
});

test("formats local times without converting through UTC", () => {
  assert.equal(formatLocalTime("15:00"), "3:00 PM");
  assert.equal(formatLocalTime(null), null);
});

test("orders all-day items before timed items and times chronologically", () => {
  assert.equal(compareLocalTimes(null, "08:00"), -1);
  assert.equal(compareLocalTimes("15:00", "09:00"), 1);
});
