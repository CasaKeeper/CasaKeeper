import assert from "node:assert/strict";
import test from "node:test";
import { SAVE_PROGRESS_STAGES, uploadProgressMessage } from "./save-progress.ts";

test("save progress uses stage labels without claiming byte percentages", () => {
    assert.deepEqual(SAVE_PROGRESS_STAGES, [
        "Validating files",
        "Uploading attachments",
        "Saving details",
        "Finalizing",
    ]);
    assert.equal(uploadProgressMessage(1), "Uploading attachments (1 file)");
    assert.equal(uploadProgressMessage(3), "Uploading attachments (3 files)");
    assert.equal(uploadProgressMessage(-1), "Uploading attachments (0 files)");
    assert.ok(!SAVE_PROGRESS_STAGES.some((stage) => /\d+%/.test(stage)));
});
