import { app } from "@azure/functions";
import { safeLog } from "../lib/safeLog.mjs";

export async function processEmployeeQueue(message, context) {
  const payload = typeof message === "string" ? JSON.parse(message) : message;
  const recordId = payload?.recordId;
  const employeeType = payload?.employeeType;

  if (!recordId || !employeeType) {
    safeLog("warn", "Employee queue message missing recordId or employeeType.", {
      functionName: context?.functionName
    });
    return;
  }

  safeLog(
    "info",
    "Employee queue message received; workflow pending implementation.",
    {
      recordId,
      employeeType,
      functionName: context?.functionName
    }
  );

  // TODO: invoke runEmployeeSyncWorkflow({ recordId, employeeType, context }) in phase 3.
}

app.serviceBusQueue("processEmployeeQueue", {
  connection: "SERVICE_BUS_CONNECTION_STRING",
  queueName: process.env.EMPLOYEE_SYNC_QUEUE_NAME || "employee-sync",
  handler: processEmployeeQueue
});
