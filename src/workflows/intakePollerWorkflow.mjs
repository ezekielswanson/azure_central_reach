import { getIntakePollerConfig } from "../lib/config.mjs";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";
import { createHubSpotClient, searchIntakeCompleteDeals } from "../lib/hubspotClient.mjs";
import {
  createStateClient,
  acquireLease,
  releaseLease,
  hasState,
  putState
} from "../lib/cosmosState.mjs";
import { createServiceBusClient, sendClientSyncMessage } from "../lib/serviceBusClient.mjs";

const POLLER_LEASE_PK = "workflow:intake-poller";
const POLLER_LEASE_ID = "active-lease";
const DEDUPE_PK = "dedupe:client-sync";

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

export function buildIntakeDedupeId(dealId, hsLastModifiedDate) {
  return `${String(dealId)}:${String(hsLastModifiedDate)}`;
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
