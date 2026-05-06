import test from "node:test";
import assert from "node:assert/strict";
import { runEmployeeSyncWorkflow } from "../../workflows/employeeSyncWorkflow.mjs";

function buildDeps(overrides = {}) {
  const calls = {
    writebacks: [],
    stateWrites: []
  };

  const deps = {
    getConfig: () => ({
      hubspot: {
        btRbtObjectTypeId: "2-btrbt",
        bcbaObjectTypeId: "2-bcba",
        employeeIdProperty: "employee_id"
      },
      features: { allowEmployeeCreate: false, putOnlyMode: false },
      ttl: { successTtlSeconds: 120, failTtlSeconds: 60 },
      centralReach: {}
    }),
    createHubSpotClient: () => {},
    createCentralReachClient: () => {},
    createStateClient: () => {},
    getBtRbtRecordById: async () => ({
      id: "1",
      properties: {
        hs_object_id: "1",
        hs_lastmodifieddate: "2026-05-06T10:00:00.000Z",
        integration_last_write: "2026-05-06T09:00:00.000Z",
        bt_name: "Alex Rivera",
        employee_id: "100"
      }
    }),
    getBcbaRecordById: async () => ({
      id: "2",
      properties: {
        hs_object_id: "2",
        hs_lastmodifieddate: "2026-05-06T10:00:00.000Z",
        integration_last_write: "2026-05-06T09:00:00.000Z",
        bcba_name: "Pat Morgan"
      }
    }),
    buildEmployeePayload: () => ({
      employeePayload: { externalSystemId: "1", firstName: "Alex", lastName: "Rivera" },
      metadataValues: {},
      requiredLabelIds: []
    }),
    validateEmployeePayload: () => ({ isValid: true, errors: [] }),
    hashPayload: () => "hash-2",
    getEmployeeByContactId: async () => ({ externalSystemId: "1", primaryEmail: "a@test.com" }),
    buildEmployeePayloadForContactId: (payload) => ({ payload }),
    createOrUpdateEmployee: async () => ({ operation: "update", crContactId: "100" }),
    updateClientMetadata: async () => ({}),
    updateObjectProperties: async (objectTypeId, recordId, properties) => {
      calls.writebacks.push({ objectTypeId, recordId, properties });
    },
    putState: async (input) => {
      calls.stateWrites.push(input);
    },
    safeLog: () => {},
    buildErrorLog: () => ({})
  };

  return { deps: { ...deps, ...overrides }, calls };
}

test("workflow writes success state on successful update", async () => {
  const { deps, calls } = buildDeps();

  const result = await runEmployeeSyncWorkflow(
    { recordId: "1", employeeType: "bt_rbt", context: { invocationId: "inv-1" } },
    deps
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(calls.writebacks.length, 1);
  assert.equal(calls.stateWrites[0].type, "success");
});

test("workflow returns noop when hash is unchanged", async () => {
  const { deps, calls } = buildDeps({
    getBtRbtRecordById: async () => ({
      id: "1",
      properties: {
        hs_object_id: "1",
        hs_lastmodifieddate: "2026-05-06T10:00:00.000Z",
        integration_last_write: "2026-05-06T09:00:00.000Z",
        bt_name: "Alex Rivera",
        last_sync_hash: "hash-2",
        employee_id: "100"
      }
    }),
    createOrUpdateEmployee: async () => {
      throw new Error("should not be called");
    }
  });

  const result = await runEmployeeSyncWorkflow({ recordId: "1", employeeType: "bt_rbt" }, deps);
  assert.equal(result.status, "noop");
  assert.equal(calls.stateWrites[0].data.operation, "noop");
});

test("workflow returns blocked when creation is disabled", async () => {
  const { deps } = buildDeps({
    getBtRbtRecordById: async () => ({
      id: "1",
      properties: {
        hs_object_id: "1",
        hs_lastmodifieddate: "2026-05-06T10:00:00.000Z",
        bt_name: "Alex Rivera"
      }
    }),
    createOrUpdateEmployee: async () => ({ operation: "blocked", reason: "disabled" })
  });

  const result = await runEmployeeSyncWorkflow({ recordId: "1", employeeType: "bt_rbt" }, deps);
  assert.equal(result.status, "blocked");
});

test("workflow writes fail state and rethrows errors", async () => {
  const { deps, calls } = buildDeps({
    validateEmployeePayload: () => ({ isValid: false, errors: ["externalSystemId is required"] })
  });

  await assert.rejects(
    runEmployeeSyncWorkflow({ recordId: "1", employeeType: "bt_rbt" }, deps),
    /PayloadValidationError/
  );
  assert.equal(calls.stateWrites[0].type, "fail");
});
