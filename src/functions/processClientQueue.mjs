import { app } from "@azure/functions";
import { safeLog } from "../lib/safeLog.mjs";

export async function processClientQueue(message, context) {
  const payload = typeof message === "string" ? JSON.parse(message) : message;
  const dealId = payload?.dealId;

  if (!dealId) {
    safeLog("warn", "Client queue message missing dealId.", {
      functionName: context?.functionName
    });
    return;
  }

  safeLog("info", "Client queue message received; workflow pending implementation.", {
    dealId,
    functionName: context?.functionName
  });

  // TODO: invoke runClientSyncWorkflow({ dealId, context }) in phase 2.
}

app.serviceBusQueue("processClientQueue", {
  connection: "SERVICE_BUS_CONNECTION_STRING",
  queueName: process.env.CLIENT_SYNC_QUEUE_NAME || "client-sync",
  handler: processClientQueue
});
