import assert from "node:assert/strict";
import test from "node:test";
import { attachmentPreviewMode } from "./attachment-viewer.ts";

test("selects safe preview modes from MIME types and extensions", () => {
  assert.equal(attachmentPreviewMode("photo.webp", "image/webp"), "image");
  assert.equal(attachmentPreviewMode("clip.mov", "video/quicktime"), "video");
  assert.equal(attachmentPreviewMode("manual.pdf", "application/octet-stream"), "pdf");
  assert.equal(attachmentPreviewMode("manual.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "fallback");
});
