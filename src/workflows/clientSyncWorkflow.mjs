import { getConfig } from "../lib/config.mjs";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";
import { sha256 } from "../lib/hash.mjs";
import { createHubSpotClient, getDealById, updateDealProperties } from "../lib/hubspotClient.mjs";
import {
  createCentralReachClient,
  createOrUpdateClient,
  updateClientMetadata
} from "../lib/centralReachClient.mjs";
import { createStateClient, putState } from "../lib/cosmosState.mjs";
import { buildClientPayload } from "../mappings/client/buildClientPayload.mjs";
import { buildClientMetadata } from "../mappings/client/buildClientMetadata.mjs";
import { validateClientPayload } from "../mappings/client/validateClientPayload.mjs";
import { STATE_TYPES } from "../constants/state.mjs";

const CLIENT_STATE_PK = "sync:client";
const FALLBACK_CR_CONTACT_ID_PROPERTY = "client_id_number";

const REQUIRED_DEAL_PROPERTIES = [
  "hs_object_id",
  "hs_lastmodifieddate",
  "integration_last_write",
  "updated_by_integration",
  "last_sync_hash",
  "last_sync_at",
  "last_sync_status",
  "last_sync_error",
  "phi_first_name__cloned_",
  "phi_last_name",
  "phi_date_of_birth",
  "phi_gender",
  "email",
  "phone",
  "if_services_will_be_in_more_than_one_location__list_the_other_addres",
  "street_address",
  "home_apt",
  "location_city",
  "location_central_reach",
  "location",
  "postal_code",
  "guardian_first_name",
  "guardian_last_name",
  "allergies",
  "maladaptive_behaviors__clinical",
  "comorbid_diagnosis__clinical",
  "current_primary_bt",
  "current_primary_bt_2",
  "bt_work_schedule_confirmed",
  "bt_work_schedule_2_confirmed",
  "client_availability_completed",
  "assigned_hours",
  "authorized_hours",
  "auth_start_date",
  "auth_end_date",
  "physician_name",
  "npi_number",
  "physician_name__commercial",
  "npi_number__commercial",
  "most_recent_asd_diagnosis_date_medicaid",
  "most_recent_asd_diagnosis_date_1",
  "most_recent_asd_diagnosis_date_2",
  "supervising_bcba",
  "initial_assessment_bcba",
  "policy_holder_name",
  "phi__policy_holder_dob",
  "severity_level_clinical",
  "n1_what_type_of_insurance",
  "n2_what_type_of_insurance",
  "insurance_primary",
  "insurance_1__other__summary",
  "insurance_id_1",
  "insurance_id_2",
  "insurance_id_3",
  "insurance_id_4",
  "central_reach_link_to_client"
];

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }

  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableSortObject(value[key]);
    }
    return sorted;
  }

  return value;
}

function hashPayload(payload) {
  return sha256(JSON.stringify(stableSortObject(payload || {})));
}

function ensureDealId(dealId) {
  const normalized = String(dealId || "").trim();
  if (!normalized) {
    throw new Error("dealId is required");
  }
  return normalized;
}

function buildCentralReachContactUrl(contactId) {
  const id = String(contactId || "").trim();
  if (!id) {
    return null;
  }
  return `https://members.centralreach.com/#contacts/details/?id=${id}`;
}

export async function runClientSyncWorkflow(
  { dealId, hsLastModifiedDate, context },
  dependencies = {}
) {
  const getRuntimeConfig = dependencies.getConfig || getConfig;
  const initHubSpot = dependencies.createHubSpotClient || createHubSpotClient;
  const initCentralReach = dependencies.createCentralReachClient || createCentralReachClient;
  const initState = dependencies.createStateClient || createStateClient;
  const fetchDeal = dependencies.getDealById || getDealById;
  const pushWriteback = dependencies.updateDealProperties || updateDealProperties;
  const upsertClient = dependencies.createOrUpdateClient || createOrUpdateClient;
  const pushMetadata = dependencies.updateClientMetadata || updateClientMetadata;
  const saveState = dependencies.putState || putState;
  const mapPayload = dependencies.buildClientPayload || buildClientPayload;
  const mapMetadata = dependencies.buildClientMetadata || buildClientMetadata;
  const validatePayload = dependencies.validateClientPayload || validateClientPayload;
  const digestPayload = dependencies.hashPayload || hashPayload;
  const logger = dependencies.safeLog || safeLog;
  const buildError = dependencies.buildErrorLog || buildErrorLog;

  const normalizedDealId = ensureDealId(dealId);
  const config = getRuntimeConfig();
  const crContactIdProperty =
    config.hubspot.crContactIdProperty || FALLBACK_CR_CONTACT_ID_PROPERTY;

  initHubSpot(config);
  initCentralReach(config);
  initState(config);

  try {
    const deal = await fetchDeal(normalizedDealId, [...REQUIRED_DEAL_PROPERTIES, crContactIdProperty]);
    const payload = mapPayload({ deal, config });
    const validation = validatePayload(payload);

    if (!validation.isValid) {
      throw new Error(`PayloadValidationError: ${validation.errors.join(", ")}`);
    }

    const payloadHash = digestPayload(payload);
    const existingHash = deal?.properties?.last_sync_hash || null;
    const existingContactId = deal?.properties?.[crContactIdProperty] || null;

    let syncResult;
    if (existingHash && existingHash === payloadHash) {
      syncResult = {
        operation: "noop",
        crContactId: existingContactId ? String(existingContactId) : null
      };
    } else {
      syncResult = await upsertClient({
        payload,
        existingContactId
      });
    }

    const metadata = mapMetadata({ deal });
    let metadataSyncSummary = null;

    if (syncResult.crContactId) {
      metadataSyncSummary = await pushMetadata(
        syncResult.crContactId,
        metadata.metadataValues,
        { labelIds: metadata.labelIds }
      );
    }

    const status = syncResult.operation === "noop" ? "noop" : "success";
    await pushWriteback(normalizedDealId, {
      updated_by_integration: true,
      integration_last_write: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: "",
      last_sync_hash: payloadHash,
      ...(syncResult.crContactId
        ? {
            [crContactIdProperty]: String(syncResult.crContactId),
            central_reach_link_to_client: buildCentralReachContactUrl(syncResult.crContactId)
          }
        : {})
    });

    await saveState({
      pk: CLIENT_STATE_PK,
      id: normalizedDealId,
      type: STATE_TYPES.SUCCESS,
      ttlSeconds: config.ttl.successTtlSeconds,
      data: {
        workflow: "clientSync",
        status,
        operation: syncResult.operation,
        crContactId: syncResult.crContactId || null,
        payloadHash,
        hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null,
        invocationId: context?.invocationId || null,
        metadataUpdatedCount: metadataSyncSummary?.updatedCount ?? null,
        metadataFailedCount: metadataSyncSummary?.failedCount ?? null,
        updatedAt: new Date().toISOString()
      }
    });

    return {
      ok: true,
      dealId: normalizedDealId,
      status,
      operation: syncResult.operation,
      crContactId: syncResult.crContactId || null,
      metadataUpdatedCount: metadataSyncSummary?.updatedCount ?? 0,
      metadataFailedCount: metadataSyncSummary?.failedCount ?? 0
    };
  } catch (error) {
    logger(
      "error",
      "Client sync workflow failed.",
      buildError({
        workflow: "clientSync",
        stage: "runClientSyncWorkflow",
        error,
        recordId: normalizedDealId,
        extra: {
          invocationId: context?.invocationId || null,
          hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null
        }
      })
    );

    try {
      await pushWriteback(normalizedDealId, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: String(error?.message || "Client sync failed").slice(0, 500)
      });
    } catch (writebackError) {
      logger(
        "error",
        "Client sync error writeback failed.",
        buildError({
          workflow: "clientSync",
          stage: "writeErrorWriteback",
          error: writebackError,
          recordId: normalizedDealId
        })
      );
    }

    try {
      await saveState({
        pk: CLIENT_STATE_PK,
        id: normalizedDealId,
        type: STATE_TYPES.FAIL,
        ttlSeconds: config.ttl.failTtlSeconds,
        data: {
          workflow: "clientSync",
          status: "error",
          errorMessage: String(error?.message || "Client sync failed").slice(0, 500),
          hsLastModifiedDate: hsLastModifiedDate ? String(hsLastModifiedDate) : null,
          invocationId: context?.invocationId || null,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (stateError) {
      logger(
        "error",
        "Client sync fail-state write failed.",
        buildError({
          workflow: "clientSync",
          stage: "putFailState",
          error: stateError,
          recordId: normalizedDealId
        })
      );
    }

    throw error;
  }
}
