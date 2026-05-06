import axios from "axios";
import { withRetry } from "./retry.mjs";
import { CENTRAL_REACH_METADATA_FIELD_TYPES } from "../constants/centralReach.mjs";

let centralReachHttpClient = null;
let centralReachConfig = null;
let tokenCache = {
  accessToken: null,
  expiresAtMs: 0
};

export function createCentralReachClient(config) {
  centralReachConfig = config;
  centralReachHttpClient = axios.create({
    baseURL: config.centralReach.baseUrl,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.centralReach.apiKey
    },
    timeout: 15000
  });

  return centralReachHttpClient;
}

export async function getCentralReachAccessToken() {
  if (!centralReachConfig) {
    throw new Error("CentralReach client is not initialized");
  }

  if (
    tokenCache.accessToken &&
    Number.isFinite(tokenCache.expiresAtMs) &&
    tokenCache.expiresAtMs - Date.now() > 60000
  ) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: centralReachConfig.centralReach.clientId,
    client_secret: centralReachConfig.centralReach.clientSecret,
    scope: "cr-api"
  });

  const response = await withRetry(
    () =>
      axios.post(centralReachConfig.centralReach.tokenUrl, body.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        timeout: 15000
      }),
    {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 5000
    }
  );

  const accessToken = response?.data?.access_token;
  if (!accessToken) {
    throw new Error("CentralReach token request failed: access_token missing");
  }

  const expiresIn = Number(response?.data?.expires_in || 3600);
  tokenCache = {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000
  };

  return accessToken;
}

function extractCrContactId(data) {
  const candidates = [
    data?.contactId,
    data?.id,
    data?.contact?.contactId,
    data?.contact?.id,
    data?.result?.contactId,
    data?.result?.id
  ];

  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && String(candidate).trim() !== "") {
      return String(candidate);
    }
  }

  return null;
}

async function crRequest(path, { method = "GET", body, suppressRetry = false } = {}) {
  if (!centralReachHttpClient || !centralReachConfig) {
    throw new Error("CentralReach client is not initialized");
  }

  const token = await getCentralReachAccessToken();
  const request = () =>
    centralReachHttpClient.request({
      url: path,
      method,
      data: body,
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": centralReachConfig.centralReach.apiKey
      }
    });

  const response = suppressRetry ? await request() : await withRetry(request, {
    maxAttempts: 3,
    baseDelayMs: 400,
    maxDelayMs: 5000
  });

  return response?.data || null;
}

export async function createOrUpdateClient(payloadOrOptions) {
  const isOptionsObject =
    payloadOrOptions &&
    typeof payloadOrOptions === "object" &&
    Object.prototype.hasOwnProperty.call(payloadOrOptions, "payload");

  const payload = isOptionsObject ? payloadOrOptions.payload : payloadOrOptions;
  const existingContactId = isOptionsObject ? payloadOrOptions.existingContactId : null;

  if (!payload || typeof payload !== "object") {
    throw new Error("CentralReach client payload must be an object");
  }

  if (existingContactId) {
    const normalizedId = String(existingContactId).trim();
    await crRequest(`/contacts/client/${normalizedId}`, {
      method: "PUT",
      body: payload
    });

    return {
      operation: "update",
      crContactId: normalizedId
    };
  }

  const created = await crRequest("/contacts/client", {
    method: "POST",
    body: payload
  });

  const crContactId = extractCrContactId(created);
  if (!crContactId) {
    throw new Error("CentralReach create succeeded but returned no contactId");
  }

  return {
    operation: "create",
    crContactId
  };
}

function mergeUniqueNumericIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    )
  );
}

function metadataPutBody(fieldId, value) {
  const fieldType = CENTRAL_REACH_METADATA_FIELD_TYPES[Number(fieldId)] || "Input";
  const normalizedValue = String(value).trim();
  if (fieldType === "TextArea") {
    return { textAreaValue: normalizedValue };
  }
  return { inputValue: normalizedValue };
}

async function updateContactLabels(contactId, labelIds) {
  const normalizedLabelIds = mergeUniqueNumericIds(labelIds);
  if (!normalizedLabelIds.length) {
    return { operation: "skip_empty" };
  }

  try {
    await crRequest(`/contacts/${contactId}/labels`, {
      method: "POST",
      body: { labels: normalizedLabelIds.map((labelId) => ({ labelId })) }
    });
    return { operation: "updated", bodyShape: "labels[]" };
  } catch (error) {
    if (error?.response?.status !== 400) {
      throw error;
    }

    await crRequest(`/contacts/${contactId}/labels`, {
      method: "POST",
      body: { labelIds: normalizedLabelIds }
    });

    return { operation: "updated", bodyShape: "labelIds[]" };
  }
}

async function updateMetadataField(contactId, fieldId, value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { fieldId: Number(fieldId), operation: "skip_empty" };
  }

  const normalizedFieldId = Number(fieldId);
  const body = metadataPutBody(normalizedFieldId, value);

  try {
    await crRequest(`/contacts/${contactId}/metadata/${normalizedFieldId}`, {
      method: "PUT",
      body
    });

    return {
      fieldId: normalizedFieldId,
      operation: "updated",
      routeUsed: "/contacts/{ContactId}/metadata/{FieldId}"
    };
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }

    await crRequest(`/contacts/client/${contactId}/metadata/${normalizedFieldId}`, {
      method: "PUT",
      body
    });

    return {
      fieldId: normalizedFieldId,
      operation: "updated",
      routeUsed: "/contacts/client/{ContactId}/metadata/{FieldId}"
    };
  }
}

export async function updateClientMetadata(contactId, metadataValues, options = {}) {
  const normalizedContactId = String(contactId || "").trim();
  if (!normalizedContactId) {
    throw new Error("CentralReach contactId is required");
  }

  const values = metadataValues && typeof metadataValues === "object" ? metadataValues : {};
  const labelResult = await updateContactLabels(normalizedContactId, options.labelIds || []);
  const results = [];

  for (const [fieldId, value] of Object.entries(values)) {
    try {
      const result = await updateMetadataField(normalizedContactId, fieldId, value);
      results.push(result);
    } catch (error) {
      results.push({
        fieldId: Number(fieldId),
        operation: "error",
        errorMessage: String(error?.message || "Metadata update failed").slice(0, 300)
      });
    }
  }

  return {
    labelResult,
    totalFields: results.length,
    updatedCount: results.filter((item) => item.operation === "updated").length,
    skippedEmptyCount: results.filter((item) => item.operation === "skip_empty").length,
    failedCount: results.filter((item) => item.operation === "error").length,
    failedFieldIds: results
      .filter((item) => item.operation === "error")
      .map((item) => item.fieldId),
    results
  };
}

export async function createOrUpdateEmployee(payload) {
  void payload;
  throw new Error("Not implemented yet");
}
