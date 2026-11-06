import assert from "node:assert/strict";
import test from "node:test";
import { filterTasksByCompletion, normalizeTaskDate, taskPayload, taskSteps, validTaskLinks } from "./tasks.ts";

test("serializes ordered task fields without dropping blockers or notes", () => {
  assert.deepEqual(taskPayload({ title: "  Fix faucet ", description: "Context", process: ["one", "two"], links: ["https://example.com", ""], blockers: ["part"], additionalNotes: "Note" }).process_steps.map((step) => step.text), ["one", "two"]);
  assert.deepEqual(taskSteps(["one", 2, "two"]).map((step) => step.text), ["one", "two"]);
});

test("validates HTTP and HTTPS task links", () => {
  assert.equal(validTaskLinks(["https://example.com", "http://example.org/x"]), true);
  assert.equal(validTaskLinks(["ftp://example.com"]), false);
});

test("preserves date-only task values and allows clearing them", () => {
  assert.equal(normalizeTaskDate("2026-11-04"), "2026-11-04");
  assert.equal(normalizeTaskDate("2026-11-04T00:00:00.000Z"), null);
  assert.equal(taskPayload({ title: "Task", description: "", process: [], links: [], blockers: [], additionalNotes: "", scheduledDate: "2026-11-04" }).scheduled_date, "2026-11-04");
  assert.equal(taskPayload({ title: "Task", description: "", process: [], links: [], blockers: [], additionalNotes: "", scheduledDate: "" }).scheduled_date, null);
});

test("preserves optional local task time and clears it when the date is absent", () => {
  assert.equal(taskPayload({ title: "Task", description: "", process: [], links: [], blockers: [], additionalNotes: "", scheduledDate: "2026-11-04", scheduledTime: "15:00" }).scheduled_time, "15:00");
  assert.equal(taskPayload({ title: "Task", description: "", process: [], links: [], blockers: [], additionalNotes: "", scheduledDate: null, scheduledTime: "15:00" }).scheduled_time, null);
});

test("filters active and completed tasks without changing their records", () => {
  const tasks = [{ id: "a", completed: false }, { id: "b", completed: true }];
  assert.deepEqual(filterTasksByCompletion(tasks, false), [tasks[0]]);
  assert.deepEqual(filterTasksByCompletion(tasks, true), [tasks[1]]);
});
