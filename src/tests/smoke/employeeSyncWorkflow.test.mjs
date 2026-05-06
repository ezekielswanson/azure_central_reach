import test from "node:test";
import assert from "node:assert/strict";
import { runEmployeeSyncWorkflow } from "../../workflows/employeeSyncWorkflow.mjs";

function buildDeps(overrides = {}) {
  const calls = {
    writebacks: [],
    stateWrites: [],
    warnings: []
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
    writeEmployeeWriteback: async ({ objectTypeId, recordId, properties }) => {
      calls.writebacks.push({ objectTypeId, recordId, properties });
      return { fallbackUsed: false, removedProperties: [] };
    },
    putState: async (input) => {
      calls.stateWrites.push(input);
    },
    safeLog: (level, message, meta) => {
      if (level === "warn") {
        calls.warnings.push({ message, meta });
      }
    },
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
  assert.equal(calls.writebacks[0].properties.central_reach_link_to_rt_rbt, "https://members.centralreach.com/#contacts/details/?id=100");
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

test("hash match does not noop when employee_id is missing", async () => {
  let upsertCalled = false;
  const { deps } = buildDeps({
    getBtRbtRecordById: async () => ({
      id: "1",
      properties: {
        hs_object_id: "1",
        hs_lastmodifieddate: "2026-05-06T10:00:00.000Z",
        integration_last_write: "2026-05-06T09:00:00.000Z",
        bt_name: "Alex Rivera",
        last_sync_hash: "hash-2",
        employee_id: ""
      }
    }),
    createOrUpdateEmployee: async () => {
      upsertCalled = true;
      return { operation: "update", crContactId: "101" };
    }
  });

  const result = await runEmployeeSyncWorkflow({ recordId: "1", employeeType: "bt_rbt" }, deps);
  assert.equal(upsertCalled, true);
  assert.equal(result.status, "success");
  assert.equal(result.crContactId, "101");
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

test("workflow writes BCBA CentralReach link property", async () => {
  const { deps, calls } = buildDeps({
    createOrUpdateEmployee: async () => ({ operation: "update", crContactId: "200" }),
    buildEmployeePayload: () => ({
      employeePayload: { externalSystemId: "2", firstName: "Pat", lastName: "Morgan" },
      metadataValues: {},
      requiredLabelIds: [],
      warnings: []
    })
  });

  const result = await runEmployeeSyncWorkflow(
    { recordId: "2", employeeType: "bcba", context: { invocationId: "inv-2" } },
    deps
  );

  assert.equal(result.ok, true);
  assert.equal(calls.writebacks[0].properties.central_reach_record_link, "https://members.centralreach.com/#contacts/details/?id=200");
});

test("workflow keeps link writeback when employee_id fallback is used", async () => {
  const { deps, calls } = buildDeps({
    writeEmployeeWriteback: async ({ objectTypeId, recordId, properties }) => {
      calls.writebacks.push({ objectTypeId, recordId, properties });
      return { fallbackUsed: true, removedProperties: ["employee_id"] };
    },
    createOrUpdateEmployee: async () => ({ operation: "update", crContactId: "222" })
  });

  const result = await runEmployeeSyncWorkflow(
    { recordId: "1", employeeType: "bt_rbt", context: { invocationId: "inv-fallback" } },
    deps
  );

  assert.equal(result.writebackFallbackUsed, true);
  assert.equal(calls.writebacks[0].properties.central_reach_link_to_rt_rbt, "https://members.centralreach.com/#contacts/details/?id=222");
});

test("workflow logs warning and skips hubspot-link metadata when portal id missing", async () => {
  const { deps, calls } = buildDeps({
    buildEmployeePayload: () => ({
      employeePayload: { externalSystemId: "1", firstName: "Alex", lastName: "Rivera" },
      metadataValues: { 133819: "Work Address" },
      requiredLabelIds: [],
      warnings: [
        {
          code: "missing_hubspot_portal_id",
          message: "HUBSPOT_PORTAL_ID is not set; skipping HubSpot record link metadata writeback."
        }
      ]
    }),
    updateClientMetadata: async () => ({ updatedCount: 1, failedCount: 0 })
  });

  const result = await runEmployeeSyncWorkflow(
    { recordId: "1", employeeType: "bt_rbt", context: { invocationId: "inv-portal" } },
    deps
  );

  assert.equal(result.status, "success");
  assert.equal(calls.warnings.length, 1);
  assert.equal(calls.warnings[0].meta.warningCodes.includes("missing_hubspot_portal_id"), true);
});

test("BT/RBT metadata changes prevent hash-based noop", async () => {
  let upsertCalled = false;
  const { deps } = buildDeps({
    getBtRbtRecordById: async () => ({
      id: "1",
      properties: {
        hs_object_id: "1",
        hs_lastmodifieddate: "2026-05-06T10:00:00.000Z",
        integration_last_write: "2026-05-06T09:00:00.000Z",
        bt_name: "Alex Rivera",
        last_sync_hash: "hash-without-link",
        employee_id: "100"
      }
    }),
    buildEmployeePayload: () => ({
      employeePayload: { externalSystemId: "1", firstName: "Alex", lastName: "Rivera" },
      metadataValues: { 138703: "https://app.hubspot.com/contacts/50850427/record/2-btrbt/1" },
      requiredLabelIds: [],
      warnings: []
    }),
    hashPayload: (payload) =>
      payload?.metadata?.[138703] ? "hash-with-link" : "hash-without-link",
    createOrUpdateEmployee: async () => {
      upsertCalled = true;
      return { operation: "update", crContactId: "100" };
    },
    updateClientMetadata: async () => ({ updatedCount: 1, failedCount: 0, failedFieldIds: [] })
  });

  const result = await runEmployeeSyncWorkflow(
    { recordId: "1", employeeType: "bt_rbt", context: { invocationId: "inv-meta-hash" } },
    deps
  );

  assert.equal(upsertCalled, true);
  assert.equal(result.status, "success");
});

test("workflow logs warning when metadata write reports failed fields", async () => {
  const { deps, calls } = buildDeps({
    buildEmployeePayload: () => ({
      employeePayload: { externalSystemId: "1", firstName: "Alex", lastName: "Rivera" },
      metadataValues: { 138703: "https://app.hubspot.com/contacts/50850427/record/2-btrbt/1" },
      requiredLabelIds: [],
      warnings: []
    }),
    updateClientMetadata: async () => ({
      updatedCount: 0,
      failedCount: 1,
      failedFieldIds: [138703]
    })
  });

  await runEmployeeSyncWorkflow(
    { recordId: "1", employeeType: "bt_rbt", context: { invocationId: "inv-metadata-fail" } },
    deps
  );

  const metadataWarning = calls.warnings.find(
    (item) => item.message === "Employee metadata write had failures."
  );
  assert.equal(Boolean(metadataWarning), true);
  assert.equal(metadataWarning.meta.failedFieldIds.includes(138703), true);
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
