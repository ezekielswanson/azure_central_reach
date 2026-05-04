import { app } from "@azure/functions";
import { validateConfig, getConfig } from "../lib/config.mjs";
import { createHubSpotClient } from "../lib/hubspotClient.mjs";
import { createCentralReachClient } from "../lib/centralReachClient.mjs";
import { createStateClient } from "../lib/cosmosState.mjs";
import { createServiceBusClient } from "../lib/serviceBusClient.mjs";

export async function connectivityTest(request, context) {
  void request;
  void context;

  const validation = validateConfig();
  const response = {
    ok: validation.isValid,
    env: {
      isValid: validation.isValid,
      missingCount: validation.missing.length,
      missingNames: validation.missing
    },
    clients: {
      hubspot: false,
      centralReach: false,
      cosmos: false,
      serviceBus: false
    }
  };

  if (validation.isValid) {
    const config = getConfig();
    createHubSpotClient(config);
    createCentralReachClient(config);
    createStateClient(config);
    createServiceBusClient(config);
    response.clients = {
      hubspot: true,
      centralReach: true,
      cosmos: true,
      serviceBus: true
    };
  }

  return {
    status: response.ok ? 200 : 500,
    jsonBody: response
  };
}

app.http("connectivityTest", {
  methods: ["GET", "POST"],
  authLevel: "function",
  route: "connectivity-test",
  handler: connectivityTest
});
