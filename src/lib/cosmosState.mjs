import { CosmosClient } from "@azure/cosmos";

let cosmosContainer;

export function createStateClient(config) {
  const client = new CosmosClient({
    endpoint: config.state.cosmosEndpoint,
    key: config.state.cosmosKey
  });

  const database = client.database(config.state.cosmosDatabaseId);
  cosmosContainer = database.container(config.state.cosmosContainerId);
  return cosmosContainer;
}

export async function acquireLease({ pk, id, ttlSeconds }) {
  if (!cosmosContainer) {
    throw new Error("State client is not initialized");
  }

  try {
    await cosmosContainer.items.create({
      id,
      pk,
      type: "lease",
      ttl: ttlSeconds,
      createdAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    if (error.code === 409) {
      return false;
    }
    throw error;
  }
}

export async function releaseLease({ pk, id }) {
  if (!cosmosContainer) {
    throw new Error("State client is not initialized");
  }

  try {
    await cosmosContainer.item(id, pk).delete();
    return true;
  } catch (error) {
    if (error.code === 404) {
      return false;
    }
    throw error;
  }
}

export async function hasState({ pk, id }) {
  const item = await getState({ pk, id });
  return Boolean(item);
}

export async function putState({ pk, id, type, ttlSeconds, data }) {
  if (!cosmosContainer) {
    throw new Error("State client is not initialized");
  }

  const nowIso = new Date().toISOString();
  const item = {
    id,
    pk,
    type,
    ttl: ttlSeconds,
    data: data || {},
    updatedAt: nowIso
  };

  await cosmosContainer.items.upsert(item);
  return item;
}

export async function getState({ pk, id }) {
  if (!cosmosContainer) {
    throw new Error("State client is not initialized");
  }

  try {
    const { resource } = await cosmosContainer.item(id, pk).read();
    return resource ?? null;
  } catch (error) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}
