import { getConfig } from "../lib/config.mjs";
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

export async function runIntakePollerWorkflow(context) {
  const config = getConfig();
  createHubSpotClient(config);
  createStateClient(config);
  createServiceBusClient(config);

  const summary = {
    leaseAcquired: false,
    dealsScanned: 0,
    dealsDeduped: 0,
    messagesEnqueued: 0
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
    let deals = [];
    try {
      deals = await searchIntakeCompleteDeals({ limit: config.limits.maxDealsPerRun });
    } catch (error) {
      safeLog(
        "warn",
        "HubSpot intake search is not implemented yet; returning zero deals.",
        buildErrorLog({ workflow: "intakePoller", stage: "searchDeals", error })
      );
    }

    for (const deal of deals) {
      const dealId = String(deal?.id ?? "");
      if (!dealId) {
        continue;
      }

      summary.dealsScanned += 1;
      const dedupePk = "dedupe:hubspotDeal";
      const dedupeId = `deal:${dealId}`;
      const alreadyProcessed = await hasState({ pk: dedupePk, id: dedupeId });

      if (alreadyProcessed) {
        summary.dealsDeduped += 1;
        continue;
      }

      await sendClientSyncMessage({
        dealId,
        workflow: "intakePoller"
      });
      summary.messagesEnqueued += 1;

      await putState({
        pk: dedupePk,
        id: dedupeId,
        type: "dedupe",
        ttlSeconds: config.ttl.dedupeTtlSeconds,
        data: { source: "hubspotDeal" }
      });
    }

    return summary;
  } finally {
    await releaseLease({ pk: POLLER_LEASE_PK, id: POLLER_LEASE_ID });
  }
}
