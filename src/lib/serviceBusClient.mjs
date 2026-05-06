import { ServiceBusClient } from "@azure/service-bus";
import { sha256 } from "./hash.mjs";

let serviceBusClient = null;
let clientSyncSender = null;
let employeeSyncSender = null;

export function createServiceBusClient(config) {
  serviceBusClient = new ServiceBusClient(config.serviceBus.connectionString);
  clientSyncSender = null;
  employeeSyncSender = null;
  if (config.serviceBus.clientSyncQueueName) {
    clientSyncSender = serviceBusClient.createSender(config.serviceBus.clientSyncQueueName);
  }
  if (config.serviceBus.employeeSyncQueueName) {
    employeeSyncSender = serviceBusClient.createSender(config.serviceBus.employeeSyncQueueName);
  }
  return serviceBusClient;
}

export function buildClientSyncMessage({
  dealId,
  hsLastModifiedDate,
  source = "intakePoller",
  workflow = "clientSync",
  enqueuedAt = new Date().toISOString()
}) {
  const messageIdSource = `${dealId}:${hsLastModifiedDate}`;
  return {
    body: {
      workflow,
      source,
      dealId,
      hsLastModifiedDate,
      enqueuedAt
    },
    messageId: sha256(messageIdSource)
  };
}

export async function sendClientSyncMessage(message) {
  if (!clientSyncSender) {
    throw new Error("Service Bus client is not initialized");
  }

  const outboundMessage = buildClientSyncMessage({
    dealId: String(message.dealId),
    hsLastModifiedDate: String(message.hsLastModifiedDate),
    source: message.source || "intakePoller",
    workflow: message.workflow || "clientSync"
  });

  await clientSyncSender.sendMessages(outboundMessage);
}

export async function sendEmployeeSyncMessage(message) {
  if (!employeeSyncSender) {
    throw new Error("Service Bus client is not initialized");
  }

  const recordId = String(message.recordId || "");
  const employeeType = String(message.employeeType || "");
  const hsLastModifiedDate = String(message.hsLastModifiedDate || "");
  const messageIdSource = `${employeeType}:${recordId}:${hsLastModifiedDate}`;

  await employeeSyncSender.sendMessages({
    body: {
      recordId,
      employeeType,
      hsLastModifiedDate,
      workflow: message.workflow || "employeeSync",
      source: message.source || "employeePoller",
      enqueuedAt: new Date().toISOString()
    },
    messageId: sha256(messageIdSource)
  });
}
