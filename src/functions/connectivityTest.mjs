import { app } from "@azure/functions";
import { validateConfig, getConfig } from "../lib/config.mjs";
import { createHubSpotClient } from "../lib/hubspotClient.mjs";
import { createCentralReachClient } from "../lib/centralReachClient.mjs";
import { createStateClient } from "../lib/cosmosState.mjs";
import { createServiceBusClient } from "../lib/serviceBusClient.mjs";

export async function connectivityTest(request, context) {
  void request;
  void context;

  try {
    const validation = validateConfig();
    const response = {
      ok: validation.isValid,
      env: {
        isValid: validation.isValid,
        missingCount: validation.missing.length,
        placeholderCount: validation.placeholders.length,
        missingNames: validation.missing,
        placeholderNames: validation.placeholders
      },
      clients: {
        hubspot: false,
        centralReach: false,
        cosmos: false,
        serviceBus: false
      }
    };

    if (!validation.isValid || validation.placeholders.length > 0) {
      return {
        status: 200,
        jsonBody: response
      };
    }

    const config = getConfig();

    try {
      createHubSpotClient(config);
      response.clients.hubspot = true;
    } catch {
      response.ok = false;
    }

    try {
      createCentralReachClient(config);
      response.clients.centralReach = true;
    } catch {
      response.ok = false;
    }

    try {
      createStateClient(config);
      response.clients.cosmos = true;
    } catch {
      response.ok = false;
    }

    try {
      createServiceBusClient(config);
      response.clients.serviceBus = true;
    } catch {
      response.ok = false;
    }

    return {
      status: 200,
      jsonBody: response
    };
  } catch (error) {
    const errorName =
      error && typeof error === "object" && typeof error.name === "string" ? error.name : "Error";

    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: {
          message: "Connectivity test failed",
          errorName
        }
      }
    };
  }
}

app.http("connectivityTest", {
  methods: ["GET", "POST"],
  authLevel: "function",
  route: "connectivity-test",
  handler: connectivityTest
});
