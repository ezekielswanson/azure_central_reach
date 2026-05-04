import { safeString } from "./safeLog.mjs";

export function toErrorMeta(error) {
  if (!error) {
    return { name: "UnknownError", message: "Unknown error" };
  }

  return {
    name: safeString(error.name || "Error"),
    message: safeString(error.message || "Unexpected error"),
    status: error?.response?.status ?? undefined,
    code: safeString(error.code || "", 60)
  };
}

export function buildErrorLog({ workflow, stage, error, recordId, extra = {} }) {
  return {
    workflow: safeString(workflow, 80),
    stage: safeString(stage, 80),
    recordId: safeString(recordId, 120),
    error: toErrorMeta(error),
    extra
  };
}
