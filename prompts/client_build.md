You are working in the Azure Functions repo: azure_central_reach.

Goal:
Build Phase 2 of the Azure integration: Client Sync.

Canonical AWS source of business logic:
Use the AWS repo GitHub main branch as the canonical source of business logic:
https://github.com/ezekielswanson/aws_code/tree/main

If a local copy exists at ../aws_code, you may inspect it, but the canonical reference is:
https://github.com/ezekielswanson/aws_code/tree/main

Treat the AWS repo as read-only.
Do not modify ../aws_code.
Do not modify the remote AWS repo.
Only create/edit files in the current Azure repo.

Current Azure status:
Phase 1 intake poller is working.

Confirmed manual test:
POST /api/intake-poller-test returned:
- ok: true
- leaseAcquired: true
- candidatesFetched: 1
- messagesEnqueued: 1
- errorsCount: 0

Confirmed timer test:
The actual Azure timer trigger path ran successfully:
- Functions.intakePoller succeeded
- leaseAcquired: true
- candidatesFetched: 0
- messagesEnqueued: 0
- errorsCount: 0

Do not treat messagesEnqueued: 0 on the timer test as a failure. It may mean no eligible changed deals were found or the candidate was already deduped.

Important:
Do not change the intake poller business logic unless absolutely required to support client sync.
Do not change the timer schedule.
Do not change the already working Service Bus enqueue behavior from intake poller.
Do not enable local queue processing unless explicitly asked.

Build order:
1. Intake poller / intake queue logic is complete
2. Client sync now
3. Employee sync later

Safety/compliance rules:
- Do not hardcode secrets.
- Do not print secrets.
- Do not print PHI.
- Do not log names, emails, phone numbers, addresses, DOBs, payload bodies, HubSpot full records, or CentralReach full responses.
- Do not put PHI in Cosmos state.
- Do not put PHI in Service Bus messages.
- Do not edit local.settings.json.
- Do not add real values to local.settings.example.json.
- Do not deploy.
- Do not run Azure CLI commands.

Exact files allowed for this client sync build:

Primary files to edit:
- src/workflows/clientSyncWorkflow.mjs
- src/functions/processClientQueue.mjs
- src/functions/clientSyncHttpTest.mjs
- src/lib/hubspotClient.mjs
- src/lib/centralReachClient.mjs
- src/mappings/client/buildClientPayload.mjs
- src/mappings/client/buildClientMetadata.mjs
- src/mappings/client/validateClientPayload.mjs

Shared helper files allowed only if required:
- src/lib/config.mjs
- src/lib/cosmosState.mjs
- src/lib/retry.mjs
- src/lib/errors.mjs
- src/lib/safeLog.mjs
- src/lib/hash.mjs
- src/lib/dates.mjs
- src/lib/validation.mjs
- src/constants/hubspot.mjs
- src/constants/centralReach.mjs
- src/constants/state.mjs

Documentation/tests allowed:
- README.md
- src/tests/**

Files not to edit unless you explain why first:
- src/workflows/intakePollerWorkflow.mjs
- src/functions/intakePoller.mjs
- src/functions/intakePollerHttpTest.mjs
- src/lib/serviceBusClient.mjs
- host.json
- package.json
- local.settings.example.json

Never edit:
- local.settings.json

Task 1: Inspect AWS client sync logic first
Before writing Azure code, inspect the canonical AWS repo:
https://github.com/ezekielswanson/aws_code/tree/main

Find the AWS files/functions that implement:
- client sync from HubSpot deal to CentralReach client
- HubSpot deal fetch by ID
- associated contact/guardian fetch logic if present
- HubSpot property list used for client sync
- CentralReach OAuth token logic
- CentralReach create/update client logic
- ExternalSystemId matching/upsert behavior
- CR contactId/client ID writeback to HubSpot
- metadata update logic
- validation rules
- date transforms
- phone transforms
- gender transforms
- address transforms
- payload hash/idempotency logic
- integration_last_write logic
- last_sync_hash logic
- last_sync_at logic
- last_sync_status logic
- last_sync_error logic
- retry/backoff behavior
- PHI-safe logging

Do not invent new client sync business logic. Port the AWS business logic.

Task 2: Implement Azure client sync workflow
Implement:
src/workflows/clientSyncWorkflow.mjs

The workflow should:
- accept { dealId, context, hsLastModifiedDate optional }
- validate dealId
- load config from process.env through config.mjs
- initialize HubSpot client
- initialize CentralReach client
- initialize Cosmos state client
- fetch required HubSpot deal/contact data by dealId using AWS logic
- apply AWS mapping/transformation logic
- validate mapped payload
- apply AWS idempotency/hash logic
- call CentralReach create/update client logic
- update CentralReach metadata according to AWS logic
- write CR contact/client ID back to HubSpot according to AWS logic
- write safe sync state to Cosmos
- return safe summary only

Safe summary shape should be similar to:
{
  ok: true,
  dealId: "...",
  clientSync: {
    attempted: true,
    skippedNoChange: false,
    centralReachWriteAttempted: true,
    hubSpotWritebackAttempted: true,
    metadataWriteAttempted: true
  },
  errorsCount: 0
}

Do not return PHI.

Task 3: Update queue trigger
Update:
src/functions/processClientQueue.mjs

Current behavior is placeholder. Replace it so it calls:
runClientSyncWorkflow({ dealId, context, hsLastModifiedDate })

Queue message shape from intake poller:
{
  "workflow": "clientSync",
  "source": "intakePoller",
  "dealId": "...",
  "hsLastModifiedDate": "...",
  "enqueuedAt": "..."
}

Rules:
- Do not expect PHI in the queue message.
- Do not log the full queue message.
- If dealId is missing, log a safe warning and throw an error so the message is not silently completed.
- Keep queue processing production-safe.
- Do not enable the local queue trigger in settings.

Task 4: Update manual client sync HTTP test
Update:
src/functions/clientSyncHttpTest.mjs

Route:
POST /api/client-sync-test

Input:
- dealId from query string or JSON body

Behavior:
- validate dealId
- call runClientSyncWorkflow({ dealId, context })
- return safe summary only
- do not return PHI
- do not return full HubSpot records
- do not return full CentralReach responses
- missing dealId should return HTTP 400
- config/server errors should return safe HTTP 500 JSON

Task 5: Implement HubSpot helpers needed for client sync
Update:
src/lib/hubspotClient.mjs

Implement only what client sync needs based on AWS logic:
- getDealById
- associated contact fetches if AWS uses them
- updateDealProperties

Requirements:
- Use HUBSPOT_BASE_URL
- Use HUBSPOT_PRIVATE_APP_TOKEN
- Use retry helper for 429/5xx
- Do not log full responses
- Do not log PHI

Task 6: Implement CentralReach helpers needed for client sync
Update:
src/lib/centralReachClient.mjs

Implement according to AWS logic:
- getCentralReachAccessToken
- createOrUpdateClient
- updateClientMetadata

Requirements:
- Use CR_TOKEN_URL
- Use CR_BASE_URL
- Use CR_CLIENT_ID
- Use CR_CLIENT_SECRET
- Use CR_API_KEY
- Never log OAuth tokens
- Never log API keys/client secrets
- Never log PHI
- Do not return full CentralReach response bodies from HTTP test endpoints

Task 7: Implement client mapping files
Use AWS mapping logic and update/create:
- src/mappings/client/buildClientPayload.mjs
- src/mappings/client/buildClientMetadata.mjs
- src/mappings/client/validateClientPayload.mjs

Carry over AWS transforms exactly, including:
- gender normalization
- date conversion
- phone normalization
- address logic
- required field validation
- metadata field logic

Do not invent new mappings.

Task 8: Cosmos state/idempotency
Use Cosmos DB to replace DynamoDB state for client sync:
- preserve AWS idempotency/hash logic
- use item-level ttl
- store only non-PHI operational metadata
- do not store full HubSpot payloads
- do not store full CentralReach payloads

Task 9: Preserve working intake poller
After changes, these must still work:
- GET /api/connectivity-test
- POST /api/intake-poller-test
- timer function intakePoller

Do not change intake poller behavior unless explicitly required and explained.

Task 10: Tests
Add safe unit tests where practical for:
- client payload mapping with fake non-PHI data
- validation
- hash/idempotency helpers if exported
- queue message validation
- no tests should require real HubSpot, CentralReach, Cosmos, or Service Bus credentials

Task 11: README update
Update README.md with a Client Sync phase section.

Include manual test command:
npm test
npm run start
curl -i http://localhost:7071/api/connectivity-test
curl -i -X POST "http://localhost:7071/api/client-sync-test?dealId=TEST_DEAL_ID"

Also document:
- Keep AzureWebJobs.processClientQueue.Disabled=true during manual HTTP testing.
- Only enable processClientQueue after client sync HTTP test succeeds.
- Do not enable employee queue yet.

After completing changes, summarize:
1. AWS files/functions referenced from https://github.com/ezekielswanson/aws_code/tree/main
2. Azure files changed
3. Exact AWS client sync logic carried over
4. Azure-specific replacements made
5. How to manually test
6. Confirm no secrets/PHI are logged, stored, or returned