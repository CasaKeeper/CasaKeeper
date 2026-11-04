import assert from "node:assert/strict";
import test from "node:test";
import { taskPayload, taskSteps, validTaskLinks } from "./tasks.ts";

test("serializes ordered task fields without dropping blockers or notes", () => {
  assert.deepEqual(taskPayload({ title: "  Fix faucet ", description: "Context", process: ["one", "two"], links: ["https://example.com", ""], blockers: ["part"], additionalNotes: "Note" }).process_steps.map((step) => step.text), ["one", "two"]);
  assert.deepEqual(taskSteps(["one", 2, "two"]).map((step) => step.text), ["one", "two"]);
});

test("validates HTTP and HTTPS task links", () => {
  assert.equal(validTaskLinks(["https://example.com", "http://example.org/x"]), true);
  assert.equal(validTaskLinks(["ftp://example.com"]), false);
});
