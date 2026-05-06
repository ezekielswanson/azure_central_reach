import { getConfig } from "../lib/config.mjs";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";
import { sha256 } from "../lib/hash.mjs";
import {
  createHubSpotClient,
  getBtRbtRecordById,
  getBcbaRecordById,
  updateObjectProperties
} from "../lib/hubspotClient.mjs";
import {
  createCentralReachClient,
  createOrUpdateEmployee,
  getEmployeeByContactId,
  buildEmployeePayloadForContactId,
  updateClientMetadata
} from "../lib/centralReachClient.mjs";
import { createStateClient, putState } from "../lib/cosmosState.mjs";
import { buildEmployeePayload } from "../mappings/employees/buildEmployeePayload.mjs";
import { validateEmployeePayload } from "../mappings/employees/validateEmployeePayload.mjs";
import { STATE_TYPES } from "../constants/state.mjs";
import { HUBSPOT_EMPLOYEE_TYPES } from "../constants/hubspot.mjs";

const EMPLOYEE_STATE_PK = "sync:employee";
const BLOCKED_CREATE_MESSAGE =
  "PUT_ONLY_MODE enabled: create disabled until sandbox. Provide an existing employee_id or disable PUT_ONLY_MODE + enable ALLOW_EMPLOYEE_CREATE.";

const BT_RBT_PROPERTIES = [
  "hs_object_id",
  "employee_id",
  "hs_lastmodifieddate",
  "updated_by_integration",
  "integration_last_write",
  "last_sync_hash",
  "last_sync_at",
  "last_sync_status",
  "last_sync_error",
  "bt_name",
  "date_of_birth",
  "gender",
  "email",
  "street_home",
  "home_apt",
  "location_city",
  "location_home",
  "postal_code",
  "postal_code_home",
  "employee_phone",
  "bt_rbt_type",
  "street_address__work_",
  "city__work_",
  "state__work_",
  "postal_code__work_",
  "central_reach_link_to_rt_rbt"
];

const BCBA_PROPERTIES = [
  "hs_object_id",
  "employee_id",
  "hs_lastmodifieddate",
  "updated_by_integration",
  "integration_last_write",
  "last_sync_hash",
  "last_sync_at",
  "last_sync_status",
  "last_sync_error",
  "bcba_name",
  "date_of_birth",
  "email",
  "work_email",
  "address",
  "home_apt",
  "city_work",
  "home_state",
  "employee_phone",
  "medicaid_id__ny",
  "medicaid_id__nj",
  "medicaid_id__co",
  "credentialed_insurances__ny",
  "central_reach_record_link"
];

function ensureRecordId(recordId) {
  const normalized = String(recordId || "").trim();
  if (!normalized) {
    throw new Error("recordId is required");
  }
  return normalized;
}

function ensureEmployeeType(employeeType) {
  const normalized = String(employeeType || "").trim();
  if (
    normalized !== HUBSPOT_EMPLOYEE_TYPES.BT_RBT &&
    normalized !== HUBSPOT_EMPLOYEE_TYPES.BCBA
  ) {
    throw new Error("employeeType must be bt_rbt or bcba");
  }
  return normalized;
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBool(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function shouldSyncBtRbt(properties) {
  const hsLastModifiedDate = parseTimestamp(properties?.hs_lastmodifieddate);
  const integrationLastWrite = parseTimestamp(properties?.integration_last_write);
  if (!integrationLastWrite) {
    return true;
  }
  if (!hsLastModifiedDate) {
    return false;
  }
  return hsLastModifiedDate > integrationLastWrite;
}

function shouldSyncBcba(properties) {
  const hsLastModifiedDate = parseTimestamp(properties?.hs_lastmodifieddate);
  const integrationLastWrite = parseTimestamp(properties?.integration_last_write);
  const updatedByIntegration = parseBool(properties?.updated_by_integration);
  if (!integrationLastWrite) {
    return true;
  }
  if (!hsLastModifiedDate) {
    return false;
  }
  if (updatedByIntegration) {
    return hsLastModifiedDate > integrationLastWrite;
  }
  return hsLastModifiedDate > integrationLastWrite;
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) {
        continue;
      }
      sorted[key] = stableSortObject(value[key]);
    }
    return sorted;
  }
  return value;
}

function hashPayload(payload) {
  return sha256(JSON.stringify(stableSortObject(payload || {})));
}

function buildCentralReachContactUrl(contactId) {
  const id = String(contactId || "").trim();
  if (!id) {
    return null;
  }
  return `https://members.centralreach.com/#contacts/details/?id=${id}`;
}

function buildWritebackPropertyPatch({
  employeeType,
  employeeIdProperty,
  payloadHash,
  status,
  contactId,
  errorMessage
}) {
  const now = new Date().toISOString();
  const base = {
    last_sync_status: status,
    last_sync_at: now,
    last_sync_error: errorMessage || "",
    ...(status === "success" || status === "noop" || status === "blocked"
      ? { integration_last_write: now, updated_by_integration: true }
      : {})
  };

  if (payloadHash && status !== "error") {
    base.last_sync_hash = payloadHash;
  }
  if (contactId) {
    base[employeeIdProperty] = String(contactId);
    if (employeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT) {
      base.central_reach_link_to_rt_rbt = buildCentralReachContactUrl(contactId);
    } else {
      base.central_reach_record_link = buildCentralReachContactUrl(contactId);
    }
  }
  return base;
}

function getWorkflowStateId(employeeType, recordId) {
  return `${employeeType}:${recordId}`;
}

export async function runEmployeeSyncWorkflow(
  { recordId, employeeType, hsLastModifiedDate, context },
  dependencies = {}
) {
  const getRuntimeConfig = dependencies.getConfig || getConfig;
  const initHubSpot = dependencies.createHubSpotClient || createHubSpotClient;
  const initCentralReach = dependencies.createCentralReachClient || createCentralReachClient;
  const initState = dependencies.createStateClient || createStateClient;
  const fetchBtRbt = dependencies.getBtRbtRecordById || getBtRbtRecordById;
  const fetchBcba = dependencies.getBcbaRecordById || getBcbaRecordById;
  const upsertEmployee = dependencies.createOrUpdateEmployee || createOrUpdateEmployee;
  const fetchCrEmployeeById = dependencies.getEmployeeByContactId || getEmployeeByContactId;
  const preserveIdentifiers =
    dependencies.buildEmployeePayloadForContactId || buildEmployeePayloadForContactId;
  const pushMetadata = dependencies.updateClientMetadata || updateClientMetadata;
  const pushWriteback = dependencies.updateObjectProperties || updateObjectProperties;
  const saveState = dependencies.putState || putState;
  const mapPayload = dependencies.buildEmployeePayload || buildEmployeePayload;
  const validatePayload = dependencies.validateEmployeePayload || validateEmployeePayload;
  const digestPayload = dependencies.hashPayload || hashPayload;
  const logger = dependencies.safeLog || safeLog;
  const buildError = dependencies.buildErrorLog || buildErrorLog;

  const normalizedRecordId = ensureRecordId(recordId);
  const normalizedEmployeeType = ensureEmployeeType(employeeType);
  const config = getRuntimeConfig();

  const objectTypeId =
    normalizedEmployeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT
      ? config.hubspot.btRbtObjectTypeId
      : config.hubspot.bcbaObjectTypeId;
  const employeeIdProperty = config.hubspot.employeeIdProperty || "employee_id";
  const properties =
    normalizedEmployeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT
      ? [...BT_RBT_PROPERTIES, employeeIdProperty]
      : [...BCBA_PROPERTIES, employeeIdProperty];

  initHubSpot(config);
  initCentralReach(config);
  initState(config);

  try {
    const hubspotRecord =
      normalizedEmployeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT
        ? await fetchBtRbt(normalizedRecordId, objectTypeId, properties)
        : await fetchBcba(normalizedRecordId, objectTypeId, properties);
    const hubspotProps = hubspotRecord?.properties || {};

    const shouldSync =
      normalizedEmployeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT
        ? shouldSyncBtRbt(hubspotProps)
        : shouldSyncBcba(hubspotProps);

    if (!shouldSync) {
      await pushWriteback(objectTypeId, normalizedRecordId, {
        last_sync_status: "noop",
        last_sync_at: new Date().toISOString(),
        last_sync_error: ""
      });

      await saveState({
        pk: EMPLOYEE_STATE_PK,
        id: getWorkflowStateId(normalizedEmployeeType, normalizedRecordId),
        type: STATE_TYPES.SUCCESS,
        ttlSeconds: config.ttl.successTtlSeconds,
        data: {
          workflow: "employeeSync",
          employeeType: normalizedEmployeeType,
          status: "noop",
          operation: "noop",
          hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null,
          invocationId: context?.invocationId || null,
          updatedAt: new Date().toISOString()
        }
      });

      return {
        ok: true,
        recordId: normalizedRecordId,
        employeeType: normalizedEmployeeType,
        status: "noop",
        operation: "noop"
      };
    }

    const mapped = mapPayload({
      record: hubspotRecord,
      employeeType: normalizedEmployeeType,
      config
    });
    const validation = validatePayload(mapped.employeePayload);
    if (!validation.isValid) {
      throw new Error(`PayloadValidationError: ${validation.errors.join(", ")}`);
    }

    const existingContactId = String(hubspotProps?.[employeeIdProperty] || "").trim() || null;
    let outboundPayload = mapped.employeePayload;

    if (existingContactId) {
      const existingCrEmployee = await fetchCrEmployeeById(existingContactId);
      outboundPayload = preserveIdentifiers(mapped.employeePayload, existingCrEmployee).payload;
    }

    const payloadHashInput =
      normalizedEmployeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT
        ? {
            employee: outboundPayload,
            workAddress: mapped.metadataValues?.[133819] || ""
          }
        : {
            employee: outboundPayload,
            metadata: mapped.metadataValues || {}
          };

    const payloadHash = digestPayload(payloadHashInput);
    const previousHash = String(hubspotProps?.last_sync_hash || "");
    if (previousHash && previousHash === payloadHash) {
      await pushWriteback(
        objectTypeId,
        normalizedRecordId,
        buildWritebackPropertyPatch({
          employeeType: normalizedEmployeeType,
          employeeIdProperty,
          payloadHash,
          status: "noop",
          contactId: existingContactId
        })
      );

      await saveState({
        pk: EMPLOYEE_STATE_PK,
        id: getWorkflowStateId(normalizedEmployeeType, normalizedRecordId),
        type: STATE_TYPES.SUCCESS,
        ttlSeconds: config.ttl.successTtlSeconds,
        data: {
          workflow: "employeeSync",
          employeeType: normalizedEmployeeType,
          status: "noop",
          operation: "noop",
          crContactId: existingContactId,
          payloadHash,
          hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null,
          invocationId: context?.invocationId || null,
          updatedAt: new Date().toISOString()
        }
      });

      return {
        ok: true,
        recordId: normalizedRecordId,
        employeeType: normalizedEmployeeType,
        status: "noop",
        operation: "noop",
        crContactId: existingContactId
      };
    }

    const syncResult = await upsertEmployee({
      payload: outboundPayload,
      existingContactId,
      allowEmployeeCreate: config.features.allowEmployeeCreate,
      putOnlyMode: config.features.putOnlyMode
    });

    const status = syncResult.operation === "blocked" ? "blocked" : "success";
    const contactId = syncResult.crContactId || existingContactId || null;

    if (contactId && mapped.metadataValues && Object.keys(mapped.metadataValues).length > 0) {
      await pushMetadata(contactId, mapped.metadataValues, { labelIds: mapped.requiredLabelIds || [] });
    }

    await pushWriteback(
      objectTypeId,
      normalizedRecordId,
      buildWritebackPropertyPatch({
        employeeType: normalizedEmployeeType,
        employeeIdProperty,
        payloadHash,
        status,
        contactId,
        errorMessage: syncResult.reason || ""
      })
    );

    await saveState({
      pk: EMPLOYEE_STATE_PK,
      id: getWorkflowStateId(normalizedEmployeeType, normalizedRecordId),
      type: STATE_TYPES.SUCCESS,
      ttlSeconds: config.ttl.successTtlSeconds,
      data: {
        workflow: "employeeSync",
        employeeType: normalizedEmployeeType,
        status,
        operation: syncResult.operation,
        crContactId: contactId,
        payloadHash,
        hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null,
        invocationId: context?.invocationId || null,
        updatedAt: new Date().toISOString()
      }
    });

    return {
      ok: true,
      recordId: normalizedRecordId,
      employeeType: normalizedEmployeeType,
      status,
      operation: syncResult.operation,
      crContactId: contactId
    };
  } catch (error) {
    logger(
      "error",
      "Employee sync workflow failed.",
      buildError({
        workflow: "employeeSync",
        stage: "runEmployeeSyncWorkflow",
        error,
        recordId: normalizedRecordId,
        extra: {
          employeeType: normalizedEmployeeType,
          invocationId: context?.invocationId || null,
          hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null
        }
      })
    );

    try {
      await saveState({
        pk: EMPLOYEE_STATE_PK,
        id: getWorkflowStateId(normalizedEmployeeType, normalizedRecordId),
        type: STATE_TYPES.FAIL,
        ttlSeconds: config.ttl.failTtlSeconds,
        data: {
          workflow: "employeeSync",
          employeeType: normalizedEmployeeType,
          status: "error",
          errorMessage: String(error?.message || "Employee sync failed").slice(0, 500),
          hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null,
          invocationId: context?.invocationId || null,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (stateError) {
      logger(
        "error",
        "Employee sync fail-state write failed.",
        buildError({
          workflow: "employeeSync",
          stage: "putFailState",
          error: stateError,
          recordId: normalizedRecordId
        })
      );
    }

    throw error;
  }
}
