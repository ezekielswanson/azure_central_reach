import axios from "axios";
import { withRetry } from "./retry.mjs";

let hubSpotHttpClient = null;
const SEARCH_LIMIT = 50;
const EMPLOYEE_SEARCH_PROPERTIES = [
  "hs_object_id",
  "employee_id",
  "hs_lastmodifieddate",
  "updated_by_integration",
  "integration_last_write",
  "last_sync_hash",
  "last_sync_at",
  "last_sync_status",
  "last_sync_error"
];

function extractHubspotErrorBlob(error) {
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
      if (typeof subError?.code === "string") {
        messageParts.push(subError.code);
      }
    }
  }

  return messageParts.join(" ").toLowerCase();
}

function isLookbackFilterError(error) {
  const status = error?.response?.status;
  if (status !== 400 && status !== 422) {
    return false;
  }
  const blob = extractHubspotErrorBlob(error);
  return (
    blob.includes("hs_lastmodifieddate") &&
    (blob.includes("invalid") ||
      blob.includes("unknown") ||
      blob.includes("filter") ||
      blob.includes("property") ||
      blob.includes("validation"))
  );
}

function buildObjectSearchPayload({
  pipelineProperty,
  stageProperty,
  pipelineId,
  stageAllowlist,
  properties,
  limit,
  after,
  sinceIso,
  includeLookback
}) {
  const filters = [
    {
      propertyName: pipelineProperty,
      operator: "EQ",
      value: pipelineId
    },
    {
      propertyName: stageProperty,
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
    properties,
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

async function runSearch(objectPath, payload) {
  if (!hubSpotHttpClient) {
    throw new Error("HubSpot client is not initialized");
  }

  const response = await withRetry(
    () => hubSpotHttpClient.post(objectPath, payload),
    {
      maxAttempts: 3,
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
  return searchCustomObjectRecords({
    objectTypeId: "deals",
    pipelineProperty: "pipeline",
    stageProperty: "dealstage",
    pipelineId,
    stageAllowlist,
    limit,
    maxSearchRequestsPerRun,
    lookbackMinutes,
    properties: ["hs_object_id", "hs_lastmodifieddate", "integration_last_write"]
  });
}

export async function searchCustomObjectRecords({
  objectTypeId,
  pipelineProperty = "hs_pipeline",
  stageProperty = "hs_pipeline_stage",
  pipelineId,
  stageAllowlist,
  limit,
  maxSearchRequestsPerRun,
  lookbackMinutes,
  properties = EMPLOYEE_SEARCH_PROPERTIES
}) {
  const normalizedObjectTypeId = String(objectTypeId || "").trim();
  if (!normalizedObjectTypeId) {
    throw new Error("HubSpot objectTypeId is required for search");
  }

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
    const payload = buildObjectSearchPayload({
      pipelineProperty,
      stageProperty,
      pipelineId,
      stageAllowlist,
      properties,
      limit: perRequestLimit,
      after,
      sinceIso,
      includeLookback
    });

    let searchResult;
    try {
      searchResult = await runSearch(`/crm/v3/objects/${normalizedObjectTypeId}/search`, payload);
    } catch (error) {
      if (includeLookback && isLookbackFilterError(error)) {
        includeLookback = false;
        const fallbackPayload = buildObjectSearchPayload({
          pipelineProperty,
          stageProperty,
          pipelineId,
          stageAllowlist,
          properties,
          limit: perRequestLimit,
          after,
          sinceIso,
          includeLookback
        });
        searchResult = await runSearch(
          `/crm/v3/objects/${normalizedObjectTypeId}/search`,
          fallbackPayload
        );
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

export async function getDealById(dealId, properties = []) {
  if (!hubSpotHttpClient) {
    throw new Error("HubSpot client is not initialized");
  }

  const id = String(dealId || "").trim();
  if (!id) {
    throw new Error("HubSpot dealId is required");
  }

  const requestedProperties = Array.isArray(properties) ? properties : [];
  const params = requestedProperties.length
    ? { properties: requestedProperties.join(",") }
    : undefined;

  const response = await withRetry(() => hubSpotHttpClient.get(`/crm/v3/objects/deals/${id}`, { params }), {
    maxAttempts: 3,
    baseDelayMs: 400,
    maxDelayMs: 5000
  });

  return response?.data || null;
}

function hubspotMissingProperty(error, propertyName) {
  const status = error?.response?.status;
  if (status !== 400 && status !== 422) {
    return false;
  }

  const blob = extractHubspotErrorBlob(error);
  const property = String(propertyName || "").trim().toLowerCase();
  if (!property || !blob.includes(property)) {
    return false;
  }

  return (
    blob.includes("doesn't exist") ||
    blob.includes("does not exist") ||
    blob.includes("unknown property") ||
    blob.includes("invalid property") ||
    blob.includes("property")
  );
}

export async function updateEmployeeWritebackWithFallback({
  objectTypeId,
  recordId,
  properties,
  employeeIdProperty = "employee_id"
}) {
  try {
    await updateObjectProperties(objectTypeId, recordId, properties);
    return { fallbackUsed: false, removedProperties: [] };
  } catch (error) {
    const propertyName = String(employeeIdProperty || "employee_id").trim() || "employee_id";
    if (
      Object.prototype.hasOwnProperty.call(properties || {}, propertyName) &&
      hubspotMissingProperty(error, propertyName)
    ) {
      const fallbackProperties = { ...(properties || {}) };
      delete fallbackProperties[propertyName];
      await updateObjectProperties(objectTypeId, recordId, fallbackProperties);
      return { fallbackUsed: true, removedProperties: [propertyName] };
    }
    throw error;
  }
}

export async function getObjectById(objectTypeId, objectId, properties = []) {
  if (!hubSpotHttpClient) {
    throw new Error("HubSpot client is not initialized");
  }

  const normalizedTypeId = String(objectTypeId || "").trim();
  const id = String(objectId || "").trim();

  if (!normalizedTypeId) {
    throw new Error("HubSpot objectTypeId is required");
  }
  if (!id) {
    throw new Error("HubSpot objectId is required");
  }

  const requestedProperties = Array.isArray(properties) ? properties : [];
  const params = requestedProperties.length
    ? { properties: requestedProperties.join(",") }
    : undefined;

  const response = await withRetry(
    () => hubSpotHttpClient.get(`/crm/v3/objects/${normalizedTypeId}/${id}`, { params }),
    {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 5000
    }
  );

  return response?.data || null;
}

export async function updateDealProperties(dealId, properties) {
  if (!hubSpotHttpClient) {
    throw new Error("HubSpot client is not initialized");
  }

  const id = String(dealId || "").trim();
  if (!id) {
    throw new Error("HubSpot dealId is required");
  }

  if (!properties || typeof properties !== "object") {
    throw new Error("HubSpot properties payload must be an object");
  }

  const response = await withRetry(
    () => hubSpotHttpClient.patch(`/crm/v3/objects/deals/${id}`, { properties }),
    {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 5000
    }
  );

  return response?.data || null;
}

export async function updateObjectProperties(objectTypeId, objectId, properties) {
  if (!hubSpotHttpClient) {
    throw new Error("HubSpot client is not initialized");
  }

  const normalizedTypeId = String(objectTypeId || "").trim();
  const id = String(objectId || "").trim();

  if (!normalizedTypeId) {
    throw new Error("HubSpot objectTypeId is required");
  }
  if (!id) {
    throw new Error("HubSpot objectId is required");
  }
  if (!properties || typeof properties !== "object") {
    throw new Error("HubSpot properties payload must be an object");
  }

  const response = await withRetry(
    () => hubSpotHttpClient.patch(`/crm/v3/objects/${normalizedTypeId}/${id}`, { properties }),
    {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 5000
    }
  );

  return response?.data || null;
}

export async function searchEligibleBtRbtRecords({
  objectTypeId,
  pipelineId,
  stageAllowlist,
  limit,
  maxSearchRequestsPerRun,
  lookbackMinutes
}) {
  return searchCustomObjectRecords({
    objectTypeId,
    pipelineProperty: "hs_pipeline",
    stageProperty: "hs_pipeline_stage",
    pipelineId,
    stageAllowlist,
    limit,
    maxSearchRequestsPerRun,
    lookbackMinutes,
    properties: EMPLOYEE_SEARCH_PROPERTIES
  });
}

export async function searchEligibleBcbaRecords({
  objectTypeId,
  pipelineId,
  stageAllowlist,
  limit,
  maxSearchRequestsPerRun,
  lookbackMinutes
}) {
  return searchCustomObjectRecords({
    objectTypeId,
    pipelineProperty: "hs_pipeline",
    stageProperty: "hs_pipeline_stage",
    pipelineId,
    stageAllowlist,
    limit,
    maxSearchRequestsPerRun,
    lookbackMinutes,
    properties: EMPLOYEE_SEARCH_PROPERTIES
  });
}

export async function getBtRbtRecordById(recordId, objectTypeId, properties = []) {
  return getObjectById(objectTypeId, recordId, properties);
}

export async function getBcbaRecordById(recordId, objectTypeId, properties = []) {
  return getObjectById(objectTypeId, recordId, properties);
}

export async function writeEmployeeIdToObject({
  objectTypeId,
  recordId,
  employeeIdProperty = "employee_id",
  employeeId
}) {
  const safeProperty = String(employeeIdProperty || "employee_id").trim() || "employee_id";
  return updateObjectProperties(objectTypeId, recordId, {
    [safeProperty]: employeeId ? String(employeeId) : ""
  });
}
