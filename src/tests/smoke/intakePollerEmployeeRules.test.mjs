import test from "node:test";
import assert from "node:assert/strict";
import { shouldSyncBtRbt, shouldSyncBcba } from "../../workflows/intakePollerWorkflow.mjs";

test("shouldSyncBtRbt follows integration_last_write gate", () => {
  const shouldSync = shouldSyncBtRbt({
    properties: {
      hs_lastmodifieddate: "2026-05-06T11:00:00.000Z",
      integration_last_write: "2026-05-06T10:00:00.000Z"
    }
  });
  assert.equal(shouldSync, true);
});

test("shouldSyncBcba prevents stale records", () => {
  const shouldSync = shouldSyncBcba({
    properties: {
      hs_lastmodifieddate: "2026-05-06T09:00:00.000Z",
      integration_last_write: "2026-05-06T10:00:00.000Z",
      updated_by_integration: true
    }
  });
  assert.equal(shouldSync, false);
});
