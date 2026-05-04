const REQUIRED_ENV_NAMES = [
  "CR_CLIENT_ID",
  "CR_CLIENT_SECRET",
  "CR_API_KEY",
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "CR_BASE_URL",
  "CR_TOKEN_URL",
  "HUBSPOT_BASE_URL",
  "HS_DEAL_PIPELINE_ID",
  "HS_STAGE_ALLOWLIST_JSON",
  "HUBSPOT_CR_CONTACT_ID_PROPERTY",
  "MAX_DEALS_PER_RUN",
  "MAX_BT_RBT_PER_RUN",
  "MAX_BCBA_PER_RUN",
  "DEDUPE_TTL_SECONDS",
  "LEASE_TTL_SECONDS",
  "SUCCESS_TTL_SECONDS",
  "FAIL_TTL_SECONDS",
  "STATE_PROVIDER",
  "COSMOS_ENDPOINT",
  "COSMOS_KEY",
  "COSMOS_DATABASE_ID",
  "COSMOS_CONTAINER_ID",
  "STATE_TTL_ATTR",
  "SERVICE_BUS_CONNECTION_STRING",
  "CLIENT_SYNC_QUEUE_NAME",
  "EMPLOYEE_SYNC_QUEUE_NAME"
];

export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getOptionalEnv(name, defaultValue = "") {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return defaultValue;
  }
  return value.trim();
}

function isPlaceholderValue(value) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return false;
  }

  return (
    trimmed === "CHANGE_ME" ||
    trimmed.includes("CHANGE_ME") ||
    trimmed === "change_me_property_name" ||
    trimmed === "[\"CHANGE_ME\"]"
  );
}

export function validateConfig() {
  const missing = [];
  const placeholders = [];

  REQUIRED_ENV_NAMES.forEach((name) => {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      missing.push(name);
      return;
    }

    if (isPlaceholderValue(value)) {
      placeholders.push(name);
    }
  });

  return {
    isValid: missing.length === 0 && placeholders.length === 0,
    missing,
    placeholders
  };
}

export function getConfig() {
  const validation = validateConfig();
  if (!validation.isValid) {
    const missingMessage =
      validation.missing.length > 0
        ? `Missing variables: ${validation.missing.join(", ")}`
        : "";
    const placeholderMessage =
      validation.placeholders.length > 0
        ? `Placeholder variables: ${validation.placeholders.join(", ")}`
        : "";
    const details = [missingMessage, placeholderMessage].filter(Boolean).join(". ");
    throw new Error(`Configuration validation failed. ${details}`);
  }

  return {
    centralReach: {
      clientId: getRequiredEnv("CR_CLIENT_ID"),
      clientSecret: getRequiredEnv("CR_CLIENT_SECRET"),
      apiKey: getRequiredEnv("CR_API_KEY"),
      baseUrl: getRequiredEnv("CR_BASE_URL"),
      tokenUrl: getRequiredEnv("CR_TOKEN_URL")
    },
    hubspot: {
      privateAppToken: getRequiredEnv("HUBSPOT_PRIVATE_APP_TOKEN"),
      baseUrl: getRequiredEnv("HUBSPOT_BASE_URL"),
      dealPipelineId: getRequiredEnv("HS_DEAL_PIPELINE_ID"),
      stageAllowlistJson: getRequiredEnv("HS_STAGE_ALLOWLIST_JSON"),
      crContactIdProperty: getRequiredEnv("HUBSPOT_CR_CONTACT_ID_PROPERTY")
    },
    limits: {
      maxDealsPerRun: Number(getRequiredEnv("MAX_DEALS_PER_RUN")),
      maxBtRbtPerRun: Number(getRequiredEnv("MAX_BT_RBT_PER_RUN")),
      maxBcbaPerRun: Number(getRequiredEnv("MAX_BCBA_PER_RUN"))
    },
    ttl: {
      dedupeTtlSeconds: Number(getRequiredEnv("DEDUPE_TTL_SECONDS")),
      leaseTtlSeconds: Number(getRequiredEnv("LEASE_TTL_SECONDS")),
      successTtlSeconds: Number(getRequiredEnv("SUCCESS_TTL_SECONDS")),
      failTtlSeconds: Number(getRequiredEnv("FAIL_TTL_SECONDS")),
      stateTtlAttr: getRequiredEnv("STATE_TTL_ATTR")
    },
    state: {
      provider: getRequiredEnv("STATE_PROVIDER"),
      cosmosEndpoint: getRequiredEnv("COSMOS_ENDPOINT"),
      cosmosKey: getRequiredEnv("COSMOS_KEY"),
      cosmosDatabaseId: getRequiredEnv("COSMOS_DATABASE_ID"),
      cosmosContainerId: getRequiredEnv("COSMOS_CONTAINER_ID")
    },
    serviceBus: {
      connectionString: getRequiredEnv("SERVICE_BUS_CONNECTION_STRING"),
      clientSyncQueueName: getRequiredEnv("CLIENT_SYNC_QUEUE_NAME"),
      employeeSyncQueueName: getRequiredEnv("EMPLOYEE_SYNC_QUEUE_NAME")
    }
  };
}
