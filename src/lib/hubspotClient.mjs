import axios from "axios";

let hubSpotHttpClient = null;

export function createHubSpotClient(config) {
  hubSpotHttpClient = axios.create({
    baseURL: config.hubspot.baseUrl,
    headers: {
      Authorization: `Bearer ${config.hubspot.privateAppToken}`,
      "Content-Type": "application/json"
    },
    timeout: 15000
  });

  return hubSpotHttpClient;
}

export async function searchIntakeCompleteDeals({ limit }) {
  void limit;
  throw new Error("Not implemented yet");
}

export async function getDealById(dealId) {
  void dealId;
  throw new Error("Not implemented yet");
}

export async function updateDealProperties(dealId, properties) {
  void dealId;
  void properties;
  throw new Error("Not implemented yet");
}
