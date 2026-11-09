import assert from "node:assert/strict";
import test from "node:test";
import { withAttachmentTimeout } from "./attachment-request.ts";

test("attachment timeout resolves when the operation completes", async () => {
    await assert.doesNotReject(() => withAttachmentTimeout(Promise.resolve("ok"), 20));
});

test("attachment timeout rejects stalled operations", async () => {
    await assert.rejects(() => withAttachmentTimeout(new Promise(() => undefined), 5), /timed out/);
});
