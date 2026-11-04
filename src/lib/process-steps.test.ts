import assert from "node:assert/strict";
import test from "node:test";
import { mergeProcessSteps, nextProcessStep, normalizeProcessSteps, processProgress, toggleProcessStep } from "./process-steps.ts";

test("normalizes legacy strings and preserves object completion", () => {
  assert.deepEqual(normalizeProcessSteps(["First", { id: "stable", text: "Second", completed: true }]), [
    { id: "legacy-0-first", text: "First", completed: false },
    { id: "stable", text: "Second", completed: true },
  ]);
});

test("merges edited steps without losing unaffected progress", () => {
  const previous = [{ id: "a", text: "First", completed: true }, { id: "b", text: "Second", completed: false }];
  const merged = mergeProcessSteps(["Second", "First", "New"], previous);
  assert.deepEqual(merged.slice(0, 2), [{ id: "b", text: "Second", completed: false }, { id: "a", text: "First", completed: true }]);
  assert.equal(merged[2].completed, false);
});

test("calculates next step and progress", () => {
  const steps = normalizeProcessSteps([{ id: "a", text: "One", completed: true }, { id: "b", text: "Two", completed: false }]);
  assert.equal(nextProcessStep(steps)?.text, "Two");
  assert.deepEqual(processProgress(steps), { completed: 1, total: 2, allComplete: false });
  assert.equal(toggleProcessStep(steps, "b")[1].completed, true);
  assert.equal(toggleProcessStep(toggleProcessStep(steps, "b"), "b")[1].completed, false);
});
