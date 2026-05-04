# Azure CentralReach Integration (Azure Functions)

This repository is the Azure Functions version of the HubSpot to CentralReach integration.
The AWS repository remains read-only reference material and should not be modified from this repo.

## Setup

1. Ensure Node.js and Azure Functions Core Tools are installed locally.
2. Copy `local.settings.example.json` to `local.settings.json`.
3. Fill in real values in `local.settings.json` and keep it uncommitted.
4. Install dependencies:
   - `npm install`

## Local Run

- Start Azure Functions locally:
  - `npm run start`

## Local Development Notes

- `local.settings.json` is local-only and must never be committed.
- Azure Function App settings configured in the Azure Portal do not automatically sync to your local `local.settings.json`.
- For an initial local HTTP-only test, keep these settings enabled in `local.settings.json`:
  - `AzureWebJobs.intakePoller.Disabled=true`
  - `AzureWebJobs.processClientQueue.Disabled=true`
  - `AzureWebJobs.processEmployeeQueue.Disabled=true`
- This allows local testing of HTTP functions such as `connectivityTest` before setting up local Storage/Azurite and Service Bus connectivity.
- To run timer triggers locally later, configure `AzureWebJobsStorage` with Azurite or a real Azure Storage connection string.
- To run Service Bus queue triggers locally later, add `SERVICE_BUS_CONNECTION_STRING` manually in `local.settings.json` and never commit it to Git.

## Deploy Later

When ready for deployment, publish with:

- `func azure functionapp publish <your-function-app-name>`

Do not deploy yet during scaffolding.

## Configuration Notes

- Environment variables belong in Azure Function App settings for deployed environments.
- `local.settings.json` is for local-only values and should never be committed.

## Build Order

1. Intake poller (phase 1)
2. Client sync (phase 2)
3. Employee sync for BT/RBT and BCBA (phase 3)
