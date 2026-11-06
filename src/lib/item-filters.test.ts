import assert from "node:assert/strict";
import test from "node:test";
import { isTaskOverdue, matchesType, sortByMode } from "./item-filters.ts";

test("sorts by creation date with deterministic id tie breaking", () => {
  const items = [{ id: "b", title: "B", createdAt: "2026-01-01" }, { id: "a", title: "A", createdAt: "2026-01-01" }, { id: "c", title: "C", createdAt: "2026-02-01" }];
  assert.deepEqual(sortByMode(items, "created-desc").map((item) => item.id), ["c", "a", "b"]);
  assert.deepEqual(sortByMode(items, "created-asc").map((item) => item.id), ["a", "b", "c"]);
});

test("matches selected types with OR logic and supports untyped records", () => {
  assert.equal(matchesType("plumbing", ["plumbing", "electrical"]), true);
  assert.equal(matchesType(null, ["none"]), true);
  assert.equal(matchesType("plumbing", ["none"]), false);
  assert.equal(matchesType("plumbing", []), true);
});

test("overdue tasks respect completion, local times, and all-day dates", () => {
  const now = new Date(2026, 10, 10, 15, 0);
  assert.equal(isTaskOverdue({ completed: false, scheduledDate: "2026-11-09" }, "2026-11-10", now), true);
  assert.equal(isTaskOverdue({ completed: false, scheduledDate: "2026-11-10" }, "2026-11-10", now), false);
  assert.equal(isTaskOverdue({ completed: false, scheduledDate: "2026-11-10", scheduledTime: "14:59:00" }, "2026-11-10", now), true);
  assert.equal(isTaskOverdue({ completed: true, scheduledDate: "2026-11-09" }, "2026-11-10", now), false);
});
