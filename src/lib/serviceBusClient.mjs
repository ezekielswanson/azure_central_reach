import { ServiceBusClient } from "@azure/service-bus";

let serviceBusClient = null;
let clientSyncSender = null;
let employeeSyncSender = null;

export function createServiceBusClient(config) {
  serviceBusClient = new ServiceBusClient(config.serviceBus.connectionString);
  clientSyncSender = serviceBusClient.createSender(config.serviceBus.clientSyncQueueName);
  employeeSyncSender = serviceBusClient.createSender(config.serviceBus.employeeSyncQueueName);
  return serviceBusClient;
}

export async function sendClientSyncMessage(message) {
  if (!clientSyncSender) {
    throw new Error("Service Bus client is not initialized");
  }

  await clientSyncSender.sendMessages({
    body: {
      dealId: message.dealId,
      workflow: message.workflow || "intakePoller",
      enqueuedAt: new Date().toISOString()
    }
  });
}

export async function sendEmployeeSyncMessage(message) {
  if (!employeeSyncSender) {
    throw new Error("Service Bus client is not initialized");
  }

  await employeeSyncSender.sendMessages({
    body: {
      recordId: message.recordId,
      employeeType: message.employeeType,
      workflow: message.workflow || "employeeSync",
      enqueuedAt: new Date().toISOString()
    }
  });
}
