import { app } from "@azure/functions";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";
import { QUEUE_WORKFLOWS } from "../constants/queues.mjs";
import { HUBSPOT_EMPLOYEE_TYPE_SET } from "../constants/hubspot.mjs";
import { runEmployeeSyncWorkflow } from "../workflows/employeeSyncWorkflow.mjs";

function asNonEmptyString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function parseMessageBody(message) {
  if (typeof message === "string") {
    try {
      return JSON.parse(message);
    } catch {
      throw new Error("Invalid queue message body: expected valid JSON string");
    }
  }
  if (message && typeof message === "object") {
    return message;
  }
  throw new Error("Invalid queue message body: expected object or JSON string");
}

function validateQueueMessage(payload) {
  const recordId = asNonEmptyString(payload?.recordId);
  const employeeType = asNonEmptyString(payload?.employeeType);
  const workflow = asNonEmptyString(payload?.workflow);
  const hsLastModifiedDate = asNonEmptyString(payload?.hsLastModifiedDate) || undefined;

  if (!recordId) {
    throw new Error("Invalid queue message: recordId is required");
  }
  if (!HUBSPOT_EMPLOYEE_TYPE_SET.has(employeeType)) {
    throw new Error("Invalid queue message: employeeType must be bt_rbt or bcba");
  }
  if (workflow && workflow !== QUEUE_WORKFLOWS.EMPLOYEE_SYNC) {
    throw new Error("Invalid queue message: workflow must be employeeSync when provided");
  }

  return {
    recordId,
    employeeType,
    workflow: workflow || QUEUE_WORKFLOWS.EMPLOYEE_SYNC,
    hsLastModifiedDate
  };
}

function buildQueueMeta({ context, message, recordId, employeeType, workflow, hsLastModifiedDate }) {
  return {
    functionName: context?.functionName,
    invocationId: context?.invocationId,
    recordId,
    employeeType,
    workflow,
    hsLastModifiedDate,
    messageId: message?.messageId ?? context?.triggerMetadata?.messageId,
    deliveryCount: message?.deliveryCount ?? context?.triggerMetadata?.deliveryCount,
    enqueuedTimeUtc:
      message?.enqueuedTimeUtc ??
      context?.triggerMetadata?.enqueuedTimeUtc ??
      context?.triggerMetadata?.enqueuedTime
  };
}

export async function processEmployeeQueue(message, context, dependencies = {}) {
  const runWorkflow = dependencies.runWorkflow || runEmployeeSyncWorkflow;

  try {
    const payload = parseMessageBody(message);
    const validated = validateQueueMessage(payload);
    const queueMeta = buildQueueMeta({ context, message, ...validated });

    safeLog("info", "Employee queue message accepted.", queueMeta);

    await runWorkflow({
      recordId: validated.recordId,
      employeeType: validated.employeeType,
      hsLastModifiedDate: validated.hsLastModifiedDate,
      context
    });

    safeLog("info", "Employee queue message processed.", queueMeta);
  } catch (error) {
    const parsedBody = (() => {
      try {
        return parseMessageBody(message);
      } catch {
        return {};
      }
    })();

    const validationMeta = {
      recordId: asNonEmptyString(parsedBody?.recordId) || undefined,
      employeeType: asNonEmptyString(parsedBody?.employeeType) || undefined,
      workflow: asNonEmptyString(parsedBody?.workflow) || undefined,
      hsLastModifiedDate: asNonEmptyString(parsedBody?.hsLastModifiedDate) || undefined
    };

    safeLog(
      "error",
      "Employee queue processing failed.",
      buildErrorLog({
        workflow: QUEUE_WORKFLOWS.EMPLOYEE_SYNC,
        stage: "processEmployeeQueue",
        error,
        recordId: validationMeta.recordId,
        extra: buildQueueMeta({ context, message, ...validationMeta })
      })
    );

    throw error;
  }
}

app.serviceBusQueue("processEmployeeQueue", {
  connection: "SERVICE_BUS_CONNECTION_STRING",
  queueName: process.env.EMPLOYEE_SYNC_QUEUE_NAME || "employee-sync-queue",
  handler: processEmployeeQueue
});
