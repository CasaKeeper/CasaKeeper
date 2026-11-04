import test from "node:test";
import assert from "node:assert/strict";
import { matchesAuthorizedStoredMime, MAX_RESOURCE_UPLOAD_FILES, MAX_RESOURCE_UPLOAD_BYTES, canonicalResourceMime, chunkStoragePaths, isSupportedResourceFile, resourceStoragePath, safeResourceFilename, storageInfoMime } from "./resource-storage.ts";

test("normalizes missing and generic browser MIME values from safe extensions", () => {
  assert.equal(canonicalResourceMime("manual.JPG", ""), "image/jpeg");
  assert.equal(canonicalResourceMime("photo.heic", "application/octet-stream"), "image/heic");
  assert.equal(canonicalResourceMime("clip.mov", "video/quicktime"), "video/quicktime");
});

test("rejects conflicting MIME values and unsupported extensions", () => {
  assert.equal(canonicalResourceMime("manual.jpg", "application/pdf"), null);
  assert.equal(canonicalResourceMime("manual.pdf", "text/plain"), null);
  assert.equal(isSupportedResourceFile("manual.exe", "application/octet-stream"), false);
  assert.equal(safeResourceFilename("../secret.pdf"), null);
});

test("enforces upload limits and chunks storage paths", () => {
  assert.equal(MAX_RESOURCE_UPLOAD_FILES, 10);
  assert.equal(MAX_RESOURCE_UPLOAD_BYTES, 100 * 1024 * 1024);
  assert.deepEqual(chunkStoragePaths(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
});

test("builds a canonical object path from server-issued identifiers", () => {
  const path = resourceStoragePath("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "manual.pdf");
  assert.equal(path, "11111111-1111-4111-8111-111111111111/resources/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/manual.pdf");
});

test("requires an exact nonempty Storage MIME match", () => {
  assert.equal(matchesAuthorizedStoredMime("application/pdf", "application/pdf"), true);
  assert.equal(matchesAuthorizedStoredMime(" Application/PDF ", "application/pdf"), true);
  assert.equal(matchesAuthorizedStoredMime("", "application/pdf"), false);
  assert.equal(matchesAuthorizedStoredMime(undefined, "application/pdf"), false);
  assert.equal(matchesAuthorizedStoredMime("image/png", "application/pdf"), false);
});

test("reads the authoritative camelized Storage Info content type", () => {
  assert.equal(storageInfoMime({ contentType: "image/png" }), "image/png");
  assert.equal(storageInfoMime({ contentType: "application/pdf" }), "application/pdf");
  assert.equal(storageInfoMime({ mimetype: "image/png" }), "image/png");
  assert.equal(storageInfoMime({ metadata: { mimetype: "image/png" } }), "");
});
