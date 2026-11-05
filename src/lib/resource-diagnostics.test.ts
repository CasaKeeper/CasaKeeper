import assert from "node:assert/strict";
import test from "node:test";
import { appendResourceDiagnostic, knownResourcePresence, sanitizeResourceDiagnostics, type ResourceDiagnosticSnapshot } from "./resource-diagnostics.ts";

const snapshot = (event: string): ResourceDiagnosticSnapshot => ({ at: "2026-11-05T00:00:00.000Z", event, serverCount: 2, stateCount: 2, viewInputCount: 2, filteredCount: 2, renderedCount: 2, knownPresence: { "Resource A": true, "Resource B": true }, searchEmpty: true, searchLength: 0, typeFilterSelected: true, sort: "asc", detailSelected: false, viewerOpen: false, pageVisibility: "visible" });

test("records known Resource presence without exposing raw IDs", () => {
  assert.deepEqual(knownResourcePresence(["5c87f96b-a68f-4928-8888-13c32b5017ff"]), { "Resource A": true, "Resource B": false });
});

test("keeps a bounded diagnostic history", () => {
  const history = appendResourceDiagnostic([snapshot("one"), snapshot("two")], snapshot("three"), 2);
  assert.deepEqual(history.map((item) => item.event), ["two", "three"]);
});

test("sanitizes reports to structured snapshots", () => {
  const report = sanitizeResourceDiagnostics([snapshot("render")]);
  assert.match(report, /Resource A/);
  assert.doesNotMatch(report, /5c87f96b/);
});
