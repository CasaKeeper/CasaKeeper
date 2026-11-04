import assert from "node:assert/strict";
import test from "node:test";
import { routineCompletionWrite, toggleOccurrenceStep } from "./routine-completions.ts";

test("completion writes distinguish complete, reopened, and process-only states", () => {
  const progress = { stepA: true };
  assert.deepEqual(routineCompletionWrite(true, progress, "2026-11-03T12:00:00.000Z"), { completed: true, completed_at: "2026-11-03T12:00:00.000Z", process_steps: progress });
  assert.deepEqual(routineCompletionWrite(false, progress, "2026-11-03T12:00:00.000Z"), { completed: false, completed_at: null, process_steps: progress });
});

test("occurrence progress toggles without affecting another occurrence", () => {
  const first = toggleOccurrenceStep({}, "stepA");
  const second = toggleOccurrenceStep({}, "stepA");
  assert.deepEqual(first, second);
  assert.deepEqual(toggleOccurrenceStep(first, "stepA"), { stepA: false });
});
