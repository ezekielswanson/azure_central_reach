# Azure CentralReach Integration (Azure Functions)

This repository is the Azure Functions version of the HubSpot to CentralReach integration.
The AWS repository remains read-only reference material and should not be modified from this repo.

## Setup

1. Ensure Node.js and Azure Functions Core Tools are installed locally.
2. Copy `local.settings.example.json` to `local.settings.json`.
3. Install dependencies:
   - `npm install`

## A. Scaffold Smoke Test

Purpose: verify local HTTP scaffold wiring only.

1. Keep local timer/queue functions disabled in `local.settings.json`:
   - `AzureWebJobs.intakePoller.Disabled=true`
   - `AzureWebJobs.processClientQueue.Disabled=true`
   - `AzureWebJobs.processEmployeeQueue.Disabled=true`
2. Run:
   - `npm test`
   - `npm run start`
   - `curl -i http://localhost:7071/api/connectivity-test`

Expected behavior:
- This can run with placeholder values.
- `/api/connectivity-test` returns a JSON response and reports missing/placeholder config safely.

## B. Intake Poller Manual Test

Purpose: run intake poller business logic manually through HTTP before enabling the timer.

1. Configure real local intake values in `local.settings.json` (HubSpot, Cosmos, and Service Bus intake dependencies).
2. Run:
   - `npm run start`
   - `curl -i -X POST http://localhost:7071/api/intake-poller-test`

Behavior notes:
- If required intake configuration is missing, endpoint returns HTTP 500 with:
  - `ok: false`
  - `error.code: "MISSING_REQUIRED_CONFIG"`
- In missing-config mode, endpoint does not perform external network calls.

## C. Deployment Gate

Do not deploy until manual intake poller test confirms:
- HubSpot eligible deals can be fetched.
- `shouldSync` logic runs.
- Cosmos lease/dedupe state works.
- Service Bus client-sync messages are enqueued.
- No PHI appears in logs, state, or Service Bus messages.

## D. Deployment Command Later

When deployment is explicitly approved:
- `func azure functionapp publish centralreachfunction`

## E. Timer Enablement

Do not enable scheduled intake polling until the deployed manual intake endpoint succeeds in Azure.

## Configuration Notes

- `local.settings.json` is local-only and must never be committed.
- Azure Function App settings configured in Azure do not automatically sync to local.
- Environment variables for deployed environments belong in Function App settings.

## Build Order

1. Intake poller / intake queue (phase 1)
2. Client sync (phase 2)
3. Employee sync (phase 3)
