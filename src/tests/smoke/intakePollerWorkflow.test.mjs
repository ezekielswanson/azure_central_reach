import test from "node:test";
import assert from "node:assert/strict";
import { buildIntakeDedupeId, shouldSyncDeal } from "../../workflows/intakePollerWorkflow.mjs";

test("buildIntakeDedupeId uses deal and last modified date", () => {
  const dedupeId = buildIntakeDedupeId("123", "1700000000000");
  assert.equal(dedupeId, "123:1700000000000");
});

test("shouldSyncDeal true when integration_last_write missing", () => {
  const candidate = {
    properties: {
      hs_lastmodifieddate: "2025-05-01T12:00:00.000Z"
    }
  };

  assert.equal(shouldSyncDeal(candidate), true);
});

test("shouldSyncDeal false when hs_lastmodifieddate is not newer", () => {
  const candidate = {
    properties: {
      hs_lastmodifieddate: "2025-05-01T12:00:00.000Z",
      integration_last_write: "2025-05-01T12:00:00.000Z"
    }
  };

  assert.equal(shouldSyncDeal(candidate), false);
});
