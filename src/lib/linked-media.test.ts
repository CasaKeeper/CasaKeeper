import assert from "node:assert/strict";
import test from "node:test";
import { getLinkedMedia, indexResourceAttachments } from "./supabase/linked-media.ts";

test("projects linked Resource attachments for a parent without cross-parent leakage", () => {
  const attachments = indexResourceAttachments([
    { id: "attachment-a", parent_id: "resource-a", original_filename: "a.pdf", mime_type: "application/pdf", file_size: 10, storage_path: "a/path" },
    { id: "attachment-b", parent_id: "resource-b", original_filename: "b.png", mime_type: "image/png", file_size: 20, storage_path: "b/path" },
  ]);
  const links = [
    { id: "link-task-a", resource_id: "resource-a", parent_type: "task" as const, parent_id: "task-a" },
    { id: "link-routine-a", resource_id: "resource-a", parent_type: "routine" as const, parent_id: "routine-a" },
    { id: "link-task-b", resource_id: "resource-b", parent_type: "task" as const, parent_id: "task-b" },
  ];

  assert.deepEqual(getLinkedMedia("task", "task-a", links, attachments), [{
    id: "attachment-a",
    name: "a.pdf",
    type: "application/pdf",
    size: 10,
    storagePath: "a/path",
    previewUrl: undefined,
    resourceId: "resource-a",
    resourceLinkId: "link-task-a",
  }]);
  assert.deepEqual(getLinkedMedia("routine", "task-a", links, attachments), []);
});
