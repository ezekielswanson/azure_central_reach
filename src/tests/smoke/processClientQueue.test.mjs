import test from "node:test";
import assert from "node:assert/strict";
import { processClientQueue } from "../../functions/processClientQueue.mjs";

const baseContext = {
  functionName: "processClientQueue",
  invocationId: "inv-1",
  triggerMetadata: {
    messageId: "msg-1",
    deliveryCount: 1,
    enqueuedTimeUtc: "2026-05-06T00:00:00.000Z"
  }
};

test("valid message calls workflow with dealId and hsLastModifiedDate", async () => {
  let calledWith;
  const runWorkflow = async (input) => {
    calledWith = input;
  };

  await processClientQueue(
    {
      dealId: "123",
      hsLastModifiedDate: "1700000000000",
      workflow: "clientSync",
      source: "intakePoller",
      enqueuedAt: "2026-05-06T00:00:00.000Z"
    },
    baseContext,
    { runWorkflow }
  );

  assert.deepEqual(calledWith, {
    dealId: "123",
    hsLastModifiedDate: "1700000000000",
    context: baseContext
  });
});

test("missing dealId throws", async () => {
  await assert.rejects(
    processClientQueue(
      {
        workflow: "clientSync",
        source: "intakePoller"
      },
      baseContext,
      { runWorkflow: async () => {} }
    ),
    /dealId is required/
  );
});

test("invalid JSON string body throws", async () => {
  await assert.rejects(
    processClientQueue("{ bad-json", baseContext, { runWorkflow: async () => {} }),
    /expected valid JSON string/
  );
});

test("wrong workflow throws", async () => {
  await assert.rejects(
    processClientQueue(
      {
        dealId: "123",
        workflow: "employeeSync",
        source: "intakePoller"
      },
      baseContext,
      { runWorkflow: async () => {} }
    ),
    /workflow must be clientSync/
  );
});

test("missing source is allowed and treated as unknown", async () => {
  let calledWith;
  const runWorkflow = async (input) => {
    calledWith = input;
  };

  await processClientQueue(
    {
      dealId: "123",
      workflow: "clientSync"
    },
    baseContext,
    { runWorkflow }
  );

  assert.equal(calledWith.dealId, "123");
});

test("source outside allowlist throws", async () => {
  await assert.rejects(
    processClientQueue(
      {
        dealId: "123",
        workflow: "clientSync",
        source: "unexpectedSource"
      },
      baseContext,
      { runWorkflow: async () => {} }
    ),
    /source is not allowed/
  );
});

test("workflow failure is rethrown for retry/dead-letter behavior", async () => {
  const error = new Error("workflow failed");

  await assert.rejects(
    processClientQueue(
      {
        dealId: "123",
        hsLastModifiedDate: "1700000000000",
        workflow: "clientSync",
        source: "intakePoller"
      },
      baseContext,
      { runWorkflow: async () => {
        throw error;
      } }
    ),
    /workflow failed/
  );
});
