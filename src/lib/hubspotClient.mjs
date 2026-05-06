import axios from "axios";
import { withRetry } from "./retry.mjs";

let hubSpotHttpClient = null;
const SEARCH_LIMIT = 50;

function isLookbackFilterError(error) {
  const status = error?.response?.status;
  if (status !== 400 && status !== 422) {
    return false;
  }

  const data = error?.response?.data || {};
  const messageParts = [];

  if (typeof error?.message === "string") {
    messageParts.push(error.message);
  }
  if (typeof data?.message === "string") {
    messageParts.push(data.message);
  }
  if (typeof data?.category === "string") {
    messageParts.push(data.category);
  }
  if (typeof data?.subCategory === "string") {
    messageParts.push(data.subCategory);
  }

  if (Array.isArray(data?.errors)) {
    for (const subError of data.errors) {
      if (typeof subError?.message === "string") {
        messageParts.push(subError.message);
      }
      if (typeof subError?.subCategory === "string") {
        messageParts.push(subError.subCategory);
      }
    }
  }

  const blob = messageParts.join(" ").toLowerCase();
  return (
    blob.includes("hs_lastmodifieddate") &&
    (blob.includes("invalid") ||
      blob.includes("unknown") ||
      blob.includes("filter") ||
      blob.includes("property") ||
      blob.includes("validation"))
  );
}

function buildDealSearchPayload({
  pipelineId,
  stageAllowlist,
  limit,
  after,
  sinceIso,
  includeLookback
}) {
  const filters = [
    {
      propertyName: "pipeline",
      operator: "EQ",
      value: pipelineId
    },
    {
      propertyName: "dealstage",
      operator: "IN",
      values: stageAllowlist
    }
  ];

  if (includeLookback && sinceIso) {
    filters.push({
      propertyName: "hs_lastmodifieddate",
      operator: "GTE",
      value: sinceIso
    });
  }

  return {
    filterGroups: [{ filters }],
    properties: ["hs_object_id", "hs_lastmodifieddate", "integration_last_write"],
    sorts: [
      {
        propertyName: "hs_lastmodifieddate",
        direction: "DESCENDING"
      }
    ],
    limit,
    ...(after ? { after } : {})
  };
}

async function runSearch(payload) {
  if (!hubSpotHttpClient) {
    throw new Error("HubSpot client is not initialized");
  }

  const response = await withRetry(
    () => hubSpotHttpClient.post("/crm/v3/objects/deals/search", payload),
    {
      maxAttempts: 2,
      baseDelayMs: 250,
      maxDelayMs: 5000
    }
  );

  return response?.data || {};
}

export function createHubSpotClient(config) {
  hubSpotHttpClient = axios.create({
    baseURL: config.hubspot.baseUrl,
    headers: {
      Authorization: `Bearer ${config.hubspot.privateAppToken}`,
      "Content-Type": "application/json"
    },
    timeout: 15000
  });

  return hubSpotHttpClient;
}

export async function searchIntakeCompleteDeals({
  limit,
  maxSearchRequestsPerRun,
  lookbackMinutes,
  pipelineId,
  stageAllowlist
}) {
  const cappedLimit = Math.max(Number(limit) || 0, 0);
  if (cappedLimit === 0) {
    return [];
  }
  if (!pipelineId || !Array.isArray(stageAllowlist) || stageAllowlist.length === 0) {
    throw new Error("Missing required HubSpot intake search filters");
  }

  const perRequestLimit = Math.min(SEARCH_LIMIT, cappedLimit);
  const maxSearchRequests = Math.max(Number(maxSearchRequestsPerRun) || 1, 1);
  const sinceIso = new Date(
    Date.now() - Math.max(Number(lookbackMinutes) || 0, 0) * 60 * 1000
  ).toISOString();

  let after = null;
  let includeLookback = true;
  let requests = 0;
  const deals = [];

  while (deals.length < cappedLimit && requests < maxSearchRequests) {
    const payload = buildDealSearchPayload({
      pipelineId,
      stageAllowlist,
      limit: perRequestLimit,
      after,
      sinceIso,
      includeLookback
    });

    let searchResult;
    try {
      searchResult = await runSearch(payload);
    } catch (error) {
      if (includeLookback && isLookbackFilterError(error)) {
        includeLookback = false;
        const fallbackPayload = buildDealSearchPayload({
          pipelineId,
          stageAllowlist,
          limit: perRequestLimit,
          after,
          sinceIso,
          includeLookback
        });
        searchResult = await runSearch(fallbackPayload);
      } else {
        throw error;
      }
    }

    requests += 1;
    const pageResults = Array.isArray(searchResult?.results) ? searchResult.results : [];
    deals.push(...pageResults);

    after = searchResult?.paging?.next?.after || null;
    if (!after) {
      break;
    }
  }

  return deals.slice(0, cappedLimit);
}

export async function getDealById(dealId) {
  void dealId;
  throw new Error("Not implemented yet");
}

export async function updateDealProperties(dealId, properties) {
  void dealId;
  void properties;
  throw new Error("Not implemented yet");
}
