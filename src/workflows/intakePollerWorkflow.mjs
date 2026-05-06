import { getIntakePollerConfig } from "../lib/config.mjs";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";
import {
  createHubSpotClient,
  searchIntakeCompleteDeals,
  searchEligibleBtRbtRecords,
  searchEligibleBcbaRecords
} from "../lib/hubspotClient.mjs";
import {
  createStateClient,
  acquireLease,
  releaseLease,
  hasState,
  putState
} from "../lib/cosmosState.mjs";
import {
  createServiceBusClient,
  sendClientSyncMessage,
  sendEmployeeSyncMessage
} from "../lib/serviceBusClient.mjs";
import { HUBSPOT_EMPLOYEE_TYPES } from "../constants/hubspot.mjs";

const POLLER_LEASE_PK = "workflow:intake-poller";
const POLLER_LEASE_ID = "active-lease";
const DEDUPE_PK = "dedupe:client-sync";
const EMPLOYEE_DEDUPE_PK = "dedupe:employee-sync";

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const asEpoch = new Date(value).getTime();
  return Number.isFinite(asEpoch) ? asEpoch : null;
}

export function shouldSyncDeal(candidate) {
  const properties = candidate?.properties || {};
  const hsLastModifiedDate = parseTimestamp(properties.hs_lastmodifieddate);
  const integrationLastWrite = parseTimestamp(properties.integration_last_write);

  if (!integrationLastWrite) {
    return true;
  }
  if (!hsLastModifiedDate) {
    return false;
  }

  return hsLastModifiedDate > integrationLastWrite;
}

export function shouldSyncBtRbt(candidate) {
  return shouldSyncDeal(candidate);
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

export function shouldSyncBcba(candidate) {
  const properties = candidate?.properties || {};
  const hsLastModifiedDate = parseTimestamp(properties.hs_lastmodifieddate);
  const integrationLastWrite = parseTimestamp(properties.integration_last_write);
  const updatedByIntegration = parseBool(properties.updated_by_integration);

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

export function buildIntakeDedupeId(dealId, hsLastModifiedDate) {
  return `${String(dealId)}:${String(hsLastModifiedDate)}`;
}

function buildEmployeeDedupeId(employeeType, recordId, hsLastModifiedDate) {
  return `${String(employeeType)}:${String(recordId)}:${String(hsLastModifiedDate)}`;
}

export async function runIntakePollerWorkflow(context) {
  void context;
  const config = getIntakePollerConfig();
  createHubSpotClient(config);
  createStateClient(config);
  createServiceBusClient(config);

  const summary = {
    leaseAcquired: false,
    candidatesFetched: 0,
    skippedAlreadyProcessed: 0,
    skippedShouldSyncFalse: 0,
    messagesEnqueued: 0,
    btRbtCandidatesFetched: 0,
    btRbtMessagesEnqueued: 0,
    btRbtSkippedAlreadyProcessed: 0,
    btRbtSkippedShouldSyncFalse: 0,
    bcbaCandidatesFetched: 0,
    bcbaMessagesEnqueued: 0,
    bcbaSkippedAlreadyProcessed: 0,
    bcbaSkippedShouldSyncFalse: 0,
    errorsCount: 0
  };

  const leaseAcquired = await acquireLease({
    pk: POLLER_LEASE_PK,
    id: POLLER_LEASE_ID,
    ttlSeconds: config.ttl.leaseTtlSeconds
  });
  summary.leaseAcquired = leaseAcquired;

  if (!leaseAcquired) {
    safeLog("info", "Intake poller skipped; active lease exists.");
    return summary;
  }

  try {
    let candidates = [];
    try {
      candidates = await searchIntakeCompleteDeals({
        limit: config.limits.maxDealsPerRun,
        maxSearchRequestsPerRun: config.limits.maxSearchRequestsPerRun,
        lookbackMinutes: config.limits.lookbackMinutes,
        pipelineId: config.hubspot.dealPipelineId,
        stageAllowlist: config.hubspot.stageAllowlist
      });
    } catch (error) {
      safeLog(
        "error",
        "HubSpot intake search failed.",
        buildErrorLog({ workflow: "intakePoller", stage: "searchDeals", error })
      );
      summary.errorsCount += 1;
      return summary;
    }

    summary.candidatesFetched = candidates.length;

    for (const candidate of candidates) {
      const dealId = String(candidate?.id ?? candidate?.properties?.hs_object_id ?? "");
      const hsLastModifiedDate = String(candidate?.properties?.hs_lastmodifieddate ?? "");
      if (!dealId) {
        summary.skippedShouldSyncFalse += 1;
        continue;
      }

      if (!hsLastModifiedDate || !shouldSyncDeal(candidate)) {
        summary.skippedShouldSyncFalse += 1;
        continue;
      }

      const dedupeId = buildIntakeDedupeId(dealId, hsLastModifiedDate);
      const alreadyProcessed = await hasState({ pk: DEDUPE_PK, id: dedupeId });

      if (alreadyProcessed) {
        summary.skippedAlreadyProcessed += 1;
        continue;
      }

      try {
        await sendClientSyncMessage({
          dealId,
          hsLastModifiedDate,
          source: "intakePoller",
          workflow: "clientSync"
        });
        summary.messagesEnqueued += 1;

        await putState({
          pk: DEDUPE_PK,
          id: dedupeId,
          type: "dedupe",
          ttlSeconds: config.ttl.dedupeTtlSeconds,
          data: {
            module: "client",
            source: "intakePoller"
          }
        });
      } catch (error) {
        summary.errorsCount += 1;
        safeLog(
          "error",
          "Failed processing intake candidate.",
          buildErrorLog({
            workflow: "intakePoller",
            stage: "processCandidate",
            error,
            recordId: dealId
          })
        );
      }
    }

    try {
      const btRbtCandidates = await searchEligibleBtRbtRecords({
        objectTypeId: config.hubspot.btRbtObjectTypeId,
        pipelineId: config.hubspot.btRbtPipelineId,
        stageAllowlist: config.hubspot.btRbtStageAllowlist,
        limit: config.limits.maxBtRbtPerRun,
        maxSearchRequestsPerRun: config.limits.maxSearchRequestsPerRun,
        lookbackMinutes: config.limits.lookbackMinutes
      });
      summary.btRbtCandidatesFetched = btRbtCandidates.length;

      for (const candidate of btRbtCandidates) {
        const recordId = String(candidate?.id ?? candidate?.properties?.hs_object_id ?? "");
        const hsLastModifiedDate = String(candidate?.properties?.hs_lastmodifieddate ?? "");
        if (!recordId) {
          summary.btRbtSkippedShouldSyncFalse += 1;
          continue;
        }

        if (!hsLastModifiedDate || !shouldSyncBtRbt(candidate)) {
          summary.btRbtSkippedShouldSyncFalse += 1;
          continue;
        }

        const dedupeId = buildEmployeeDedupeId(
          HUBSPOT_EMPLOYEE_TYPES.BT_RBT,
          recordId,
          hsLastModifiedDate
        );
        const alreadyProcessed = await hasState({ pk: EMPLOYEE_DEDUPE_PK, id: dedupeId });
        if (alreadyProcessed) {
          summary.btRbtSkippedAlreadyProcessed += 1;
          continue;
        }

        try {
          await sendEmployeeSyncMessage({
            workflow: "employeeSync",
            source: "employeePoller",
            employeeType: HUBSPOT_EMPLOYEE_TYPES.BT_RBT,
            recordId,
            hsLastModifiedDate
          });
          summary.btRbtMessagesEnqueued += 1;

          await putState({
            pk: EMPLOYEE_DEDUPE_PK,
            id: dedupeId,
            type: "dedupe",
            ttlSeconds: config.ttl.dedupeTtlSeconds,
            data: {
              module: "employee",
              employeeType: HUBSPOT_EMPLOYEE_TYPES.BT_RBT,
              source: "employeePoller"
            }
          });
        } catch (error) {
          summary.errorsCount += 1;
          safeLog(
            "error",
            "Failed processing BT/RBT candidate.",
            buildErrorLog({
              workflow: "intakePoller",
              stage: "processBtRbtCandidate",
              error,
              recordId
            })
          );
        }
      }
    } catch (error) {
      summary.errorsCount += 1;
      safeLog(
        "error",
        "BT/RBT poller search failed.",
        buildErrorLog({
          workflow: "intakePoller",
          stage: "searchBtRbt",
          error
        })
      );
    }

    try {
      const bcbaCandidates = await searchEligibleBcbaRecords({
        objectTypeId: config.hubspot.bcbaObjectTypeId,
        pipelineId: config.hubspot.bcbaPipelineId,
        stageAllowlist: config.hubspot.bcbaStageAllowlist,
        limit: config.limits.maxBcbaPerRun,
        maxSearchRequestsPerRun: config.limits.maxSearchRequestsPerRun,
        lookbackMinutes: config.limits.lookbackMinutes
      });
      summary.bcbaCandidatesFetched = bcbaCandidates.length;

      for (const candidate of bcbaCandidates) {
        const recordId = String(candidate?.id ?? candidate?.properties?.hs_object_id ?? "");
        const hsLastModifiedDate = String(candidate?.properties?.hs_lastmodifieddate ?? "");
        if (!recordId) {
          summary.bcbaSkippedShouldSyncFalse += 1;
          continue;
        }

        if (!hsLastModifiedDate || !shouldSyncBcba(candidate)) {
          summary.bcbaSkippedShouldSyncFalse += 1;
          continue;
        }

        const dedupeId = buildEmployeeDedupeId(
          HUBSPOT_EMPLOYEE_TYPES.BCBA,
          recordId,
          hsLastModifiedDate
        );
        const alreadyProcessed = await hasState({ pk: EMPLOYEE_DEDUPE_PK, id: dedupeId });
        if (alreadyProcessed) {
          summary.bcbaSkippedAlreadyProcessed += 1;
          continue;
        }

        try {
          await sendEmployeeSyncMessage({
            workflow: "employeeSync",
            source: "employeePoller",
            employeeType: HUBSPOT_EMPLOYEE_TYPES.BCBA,
            recordId,
            hsLastModifiedDate
          });
          summary.bcbaMessagesEnqueued += 1;

          await putState({
            pk: EMPLOYEE_DEDUPE_PK,
            id: dedupeId,
            type: "dedupe",
            ttlSeconds: config.ttl.dedupeTtlSeconds,
            data: {
              module: "employee",
              employeeType: HUBSPOT_EMPLOYEE_TYPES.BCBA,
              source: "employeePoller"
            }
          });
        } catch (error) {
          summary.errorsCount += 1;
          safeLog(
            "error",
            "Failed processing BCBA candidate.",
            buildErrorLog({
              workflow: "intakePoller",
              stage: "processBcbaCandidate",
              error,
              recordId
            })
          );
        }
      }
    } catch (error) {
      summary.errorsCount += 1;
      safeLog(
        "error",
        "BCBA poller search failed.",
        buildErrorLog({
          workflow: "intakePoller",
          stage: "searchBcba",
          error
        })
      );
    }

    summary.messagesEnqueued += summary.btRbtMessagesEnqueued + summary.bcbaMessagesEnqueued;

    return summary;
  } finally {
    try {
      await releaseLease({ pk: POLLER_LEASE_PK, id: POLLER_LEASE_ID });
    } catch (error) {
      safeLog(
        "error",
        "Failed releasing intake lease.",
        buildErrorLog({ workflow: "intakePoller", stage: "releaseLease", error })
      );
      summary.errorsCount += 1;
    }
  }
}
