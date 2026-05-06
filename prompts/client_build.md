You are working in the Azure Functions repo: azure_central_reach.

Goal:
Build the full production-ready Client Sync workflow.

Canonical AWS source of business logic:
Always use the AWS repo GitHub main branch as the canonical source of business logic:
https://github.com/ezekielswanson/aws_code/tree/main

Treat the AWS repo as read-only.
Do not modify the AWS repo.
Only create/edit files in the current Azure repo.

Current Azure status:
- Intake poller is working.
- Timer path has been tested.
- Service Bus enqueue is working.
- processClientQueue is now production-ready and calls runClientSyncWorkflow.
- runClientSyncWorkflow is still not implemented and must now be built.

Important:
This is the full production-ready client sync build.
Do not implement mock logic.
Do not return fake success.
Do not build scaffold-only behavior.

Production path:
Azure timer trigger intakePoller
→ Cosmos lease/dedupe
→ Service Bus enqueue
→ processClientQueue Service Bus trigger
→ runClientSyncWorkflow
→ HubSpot fetch
→ CentralReach create/update
→ CentralReach metadata update
→ HubSpot writeback

Safety/compliance rules:
- Do not hardcode secrets.
- Do not print secrets.
- Do not print PHI.
- Do not log names, emails, phone numbers, addresses, DOBs, full HubSpot records, full CentralReach responses, or payload bodies.
- Do not put PHI in Cosmos state.
- Do not put PHI in Service Bus messages.
- Do not edit local.settings.json.
- Do not add real values to local.settings.example.json.
- Do not deploy.
- Do not run Azure CLI commands.

Primary files to edit:
- src/workflows/clientSyncWorkflow.mjs
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
- README.md
- tests related to client sync

Do not edit unless absolutely necessary:
- src/functions/intakePoller.mjs
- src/functions/intakePollerHttpTest.mjs
- src/workflows/intakePollerWorkflow.mjs
- src/functions/processClientQueue.mjs
- src/lib/serviceBusClient.mjs

Never edit:
- local.settings.json

Task 1: Inspect AWS client sync logic first
Use https://github.com/ezekielswanson/aws_code/tree/main as the canonical source.

Find and carry over the AWS logic for:
- HubSpot deal fetch by ID
- HubSpot associated records/contact fetches if used
- required HubSpot properties
- CentralReach OAuth token flow
- CentralReach client create/update
- ExternalSystemId matching/upsert behavior
- CR contactId/client ID writeback to HubSpot
- metadata updates
- validation rules
- gender normalization
- date conversion
- phone normalization
- address logic
- payload hash/idempotency
- integration_last_write logic
- last_sync_hash
- last_sync_at
- last_sync_status
- last_sync_error
- retry/backoff behavior
- PHI-safe logging

Do not invent new client sync business logic. Port the AWS behavior.

Task 2: Implement runClientSyncWorkflow
Update src/workflows/clientSyncWorkflow.mjs.

It should:
- accept { dealId, hsLastModifiedDate, context }
- validate dealId
- load config from process.env through config.mjs
- initialize HubSpot client
- initialize CentralReach client
- initialize Cosmos state client
- fetch required HubSpot data by dealId
- build CentralReach client payload using AWS mapping logic
- build CentralReach metadata using AWS mapping logic
- validate mapped payload
- apply AWS idempotency/hash logic
- create/update CentralReach client
- update CentralReach metadata
- write CR client/contact ID back to HubSpot
- write safe operational state to Cosmos
- return safe summary only

Safe summary should not include PHI or full payloads.

Task 3: Implement HubSpot helpers
Update src/lib/hubspotClient.mjs as needed:
- getDealById
- associated object/contact fetches if AWS uses them
- updateDealProperties

Use retry for 429/5xx.
Do not log full API responses.

Task 4: Implement CentralReach helpers
Update src/lib/centralReachClient.mjs as needed:
- getCentralReachAccessToken
- createOrUpdateClient
- updateClientMetadata

Never log OAuth tokens, API keys, client secrets, or full response bodies.

Task 5: Implement client mapping files
Update:
- src/mappings/client/buildClientPayload.mjs
- src/mappings/client/buildClientMetadata.mjs
- src/mappings/client/validateClientPayload.mjs

Carry over AWS mapping behavior exactly.

Task 6: Update manual client sync test endpoint
Update src/functions/clientSyncHttpTest.mjs.

Requirements:
- POST only
- route: /api/client-sync-test
- accepts dealId from JSON body, and optionally query string only when method is POST
- calls runClientSyncWorkflow({ dealId, context })
- returns safe summary only
- does not return PHI
- does not return full HubSpot or CentralReach records
- missing dealId returns HTTP 400
- server/config errors return safe HTTP 500

Task 7: Preserve processClientQueue behavior
processClientQueue should keep calling runClientSyncWorkflow and should continue to rethrow failures for retry/dead-letter behavior.
Do not make processClientQueue silently complete failed messages.

Task 8: Tests
Add safe tests where practical for:
- mapping with fake non-PHI data
- validation
- idempotency/hash helpers if exported
- client sync workflow behavior with mocked dependencies
- HTTP test endpoint behavior if practical

No tests should require real HubSpot, CentralReach, Cosmos, or Service Bus credentials.

Task 9: README update
Update README.md with Client Sync testing stages:

Manual client sync test:
npm test
npm run start
curl -i -X POST "http://localhost:7071/api/client-sync-test" \
  -H "Content-Type: application/json" \
  -d '{"dealId":"TEST_DEAL_ID"}'

Full production-level local test after manual client sync passes:
AzureWebJobs.intakePoller.Disabled=false
AzureWebJobs.processClientQueue.Disabled=false
AzureWebJobs.processEmployeeQueue.Disabled=true

Expected production path:
timer → intake poller → Service Bus → processClientQueue → runClientSyncWorkflow

After completing changes, summarize:
1. AWS files/functions referenced from https://github.com/ezekielswanson/aws_code/tree/main
2. Azure files changed
3. Exact AWS client sync logic carried over
4. Azure-specific replacements made
5. How to manually test client sync
6. How to run the full production-level timer-to-queue-to-client-sync test
7. Confirm no secrets/PHI are logged, stored, or returned