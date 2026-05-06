import test from "node:test";
import assert from "node:assert/strict";
import { buildClientSyncMessage } from "../../lib/serviceBusClient.mjs";

test("buildClientSyncMessage returns lightweight intake payload", () => {
  const message = buildClientSyncMessage({
    dealId: "999",
    hsLastModifiedDate: "1700000000000",
    enqueuedAt: "2025-05-01T12:00:00.000Z"
  });

  assert.equal(typeof message.messageId, "string");
  assert.ok(message.messageId.length > 0);
  assert.deepEqual(Object.keys(message.body).sort(), [
    "dealId",
    "enqueuedAt",
    "hsLastModifiedDate",
    "source",
    "workflow"
  ]);
  assert.equal(message.body.workflow, "clientSync");
  assert.equal(message.body.source, "intakePoller");
  assert.equal(message.body.dealId, "999");
});
