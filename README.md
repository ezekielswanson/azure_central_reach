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

## Client Queue Trigger

- `processClientQueue` is the production Service Bus trigger path for client sync.
- `runClientSyncWorkflow` is invoked from queue messages and should not be bypassed in production.
- Keep `client-sync-test` as a dev scaffold only; do not use it as the primary sync path.
- `processClientQueue` should never silently consume messages without syncing.
- Invalid queue messages should fail safely and rely on Service Bus retry/dead-letter behavior.

## Client Sync Testing Stages

1. Run local tests first:
   - `npm test`
2. Start the Functions host:
   - `npm run start`
3. Optional dev-only scaffold check (not production path):
   - `curl -i -X POST "http://localhost:7071/api/client-sync-test" -H "Content-Type: application/json" -d '{"dealId":"TEST_DEAL_ID"}'`

### Full Production-Level Local Client Sync Test

After unit tests pass and local settings contain real non-placeholder integration values:

- `AzureWebJobs.intakePoller.Disabled=false`
- `AzureWebJobs.processClientQueue.Disabled=false`
- `AzureWebJobs.processEmployeeQueue.Disabled=true`

Expected production path:

- `timer -> intakePoller -> Service Bus client-sync-queue -> processClientQueue -> runClientSyncWorkflow`

## Employee Sync Testing Stages

Keep `AzureWebJobs.processEmployeeQueue.Disabled=true` until employee sync implementation is complete and validated.

After implementation, full production-level local testing can use:

- `AzureWebJobs.intakePoller.Disabled=false`
- `AzureWebJobs.processClientQueue.Disabled=false`
- `AzureWebJobs.processEmployeeQueue.Disabled=false`

Expected production path:

- `timer -> intakePoller -> Service Bus employee-sync-queue -> processEmployeeQueue -> runEmployeeSyncWorkflow`

Employee poller guidance:

- Employee trigger/poller behavior should stay aligned with AWS main branch (`flows/combined_poller.mjs`).
- Azure intake poller should enqueue only lightweight, non-PHI employee queue messages:
  - `workflow`
  - `source`
  - `employeeType`
  - `recordId`
  - `hsLastModifiedDate`
  - `enqueuedAt`

Canonical AWS business logic reference:

- [https://github.com/ezekielswanson/aws_code/tree/main](https://github.com/ezekielswanson/aws_code/tree/main)
