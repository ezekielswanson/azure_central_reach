import test from "node:test";
import assert from "node:assert/strict";
import { processEmployeeQueue } from "../../functions/processEmployeeQueue.mjs";

const baseContext = {
  functionName: "processEmployeeQueue",
  invocationId: "inv-1",
  triggerMetadata: {
    messageId: "msg-1",
    deliveryCount: 1,
    enqueuedTimeUtc: "2026-05-06T00:00:00.000Z"
  }
};

test("valid employee message invokes employee workflow", async () => {
  let calledWith = null;
  const runWorkflow = async (input) => {
    calledWith = input;
  };

  await processEmployeeQueue(
    {
      workflow: "employeeSync",
      source: "employeePoller",
      employeeType: "bt_rbt",
      recordId: "1001",
      hsLastModifiedDate: "1700000000000",
      enqueuedAt: "2026-05-06T00:00:00.000Z"
    },
    baseContext,
    { runWorkflow }
  );

  assert.deepEqual(calledWith, {
    recordId: "1001",
    employeeType: "bt_rbt",
    hsLastModifiedDate: "1700000000000",
    context: baseContext
  });
});

test("missing recordId throws", async () => {
  await assert.rejects(
    processEmployeeQueue(
      {
        workflow: "employeeSync",
        employeeType: "bt_rbt"
      },
      baseContext,
      { runWorkflow: async () => {} }
    ),
    /recordId is required/
  );
});

test("invalid employeeType throws", async () => {
  await assert.rejects(
    processEmployeeQueue(
      {
        workflow: "employeeSync",
        employeeType: "invalid",
        recordId: "1001"
      },
      baseContext,
      { runWorkflow: async () => {} }
    ),
    /employeeType must be bt_rbt or bcba/
  );
});

test("invalid workflow throws", async () => {
  await assert.rejects(
    processEmployeeQueue(
      {
        workflow: "clientSync",
        employeeType: "bcba",
        recordId: "1001"
      },
      baseContext,
      { runWorkflow: async () => {} }
    ),
    /workflow must be employeeSync/
  );
});

test("workflow failures are rethrown for retry/dead-letter", async () => {
  await assert.rejects(
    processEmployeeQueue(
      {
        workflow: "employeeSync",
        employeeType: "bcba",
        recordId: "1001"
      },
      baseContext,
      {
        runWorkflow: async () => {
          throw new Error("workflow failed");
        }
      }
    ),
    /workflow failed/
  );
});
