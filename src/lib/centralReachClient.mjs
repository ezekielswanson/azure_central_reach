import axios from "axios";

let centralReachHttpClient = null;

export function createCentralReachClient(config) {
  centralReachHttpClient = axios.create({
    baseURL: config.centralReach.baseUrl,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.centralReach.apiKey
    },
    timeout: 15000
  });

  return centralReachHttpClient;
}

export async function getCentralReachAccessToken() {
  // TODO: Implement OAuth token exchange against CR_TOKEN_URL.
  // Never log credentials or token values in this method.
  throw new Error("Not implemented yet");
}

export async function createOrUpdateClient(payload) {
  void payload;
  throw new Error("Not implemented yet");
}

export async function updateClientMetadata(contactId, metadataValues) {
  void contactId;
  void metadataValues;
  throw new Error("Not implemented yet");
}

export async function createOrUpdateEmployee(payload) {
  void payload;
  throw new Error("Not implemented yet");
}
