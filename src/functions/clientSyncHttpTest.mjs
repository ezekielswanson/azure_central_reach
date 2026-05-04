import { app } from "@azure/functions";

function readDealId(request, body) {
  const fromQuery = request?.query?.get("dealId");
  const fromBody = body?.dealId;
  return fromQuery || fromBody || "";
}

export async function clientSyncHttpTest(request, context) {
  void context;

  let requestBody = {};
  try {
    requestBody = await request.json();
  } catch {
    requestBody = {};
  }

  const dealId = readDealId(request, requestBody);
  if (!dealId) {
    return {
      status: 400,
      jsonBody: {
        ok: false,
        message: "dealId is required"
      }
    };
  }

  return {
    status: 501,
    jsonBody: {
      ok: false,
      message: "Client sync workflow not implemented yet",
      dealId
    }
  };
}

app.http("clientSyncHttpTest", {
  methods: ["GET", "POST"],
  authLevel: "function",
  route: "client-sync-test",
  handler: clientSyncHttpTest
});
