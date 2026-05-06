You are working in the Azure Functions repo: azure_central_reach.

Goal:
Build Phase 1 of the Azure integration: the Intake Poller / Intake Queue logic.

Important:
This Azure build must carry over the same exact business logic from the AWS repo.
The only intentional logic adjustment is replacing the AWS/AWS-state enqueue pattern with Azure Service Bus enqueue.

Reference repo (canonical source of truth):
Use the AWS repo GitHub main branch as the canonical source of business logic:
https://github.com/ezekielswanson/aws_code (main)

Preferred local path for inspection:
../aws_code

Source-of-truth rule:
If local ../aws_code differs from GitHub main, GitHub main is authoritative.
Treat the AWS repo as read-only.
Do not modify local or remote AWS sources.
Only create/edit files in the current Azure repo.

Build order:
1. Intake poller / intake queue logic now
2. Client sync later
3. Employee sync later

Do not build client sync or employee sync yet except for keeping existing placeholders stable.

Safety / compliance rules:
- Do not hardcode secrets.
- Do not print secrets.
- Do not print PHI.
- Do not log names, emails, phone numbers, addresses, DOBs, or payload bodies.
- Do not add real values to local.settings.example.json.
- Do not edit local.settings.json.
- Do not deploy.
- Do not run Azure CLI commands.
- Do not enable disabled local timer/queue triggers.
- Keep local timer/queue functions disabled in example settings for HTTP-only local testing.

Task 1: Inspect AWS intake logic first
Before writing code, inspect AWS sources and identify the files/functions that implement:
- intake poller
- HubSpot deal search
- shouldSync / integration_last_write logic
- dedupe key logic
- lock/lease logic
- max deals per run logic
- error handling/logging patterns
- state writes
- enqueue/next-step behavior

Inspection order:
1) Inspect ../aws_code locally if present.
2) If local path is missing or incomplete, inspect GitHub main branch.
3) Do not invent new intake logic. Always derive behavior from canonical AWS main.

If local ../aws_code is missing, explicitly report the missing path and continue using GitHub main as source of truth.

Task 2: Port intake poller logic to Azure with parity
Implement the Azure version using the same AWS business logic.

Expected Azure mapping:
- AWS Lambda/EventBridge handler -> Azure timer function intakePoller.mjs
- AWS Secrets Manager -> process.env through config.mjs
- DynamoDB state/locks/dedupe -> Cosmos DB container through cosmosState.mjs
- AWS queue/next-step behavior -> Azure Service Bus message to CLIENT_SYNC_QUEUE_NAME
- CloudWatch logs -> console/Application Insights via safeLog.mjs

Only intentional logic adjustment:
Instead of invoking the next AWS step or writing to an AWS-specific queue/state mechanism, enqueue a lightweight Azure Service Bus message for client sync.

Service Bus message must be lightweight only:
{
  "workflow": "clientSync",
  "source": "intakePoller",
  "dealId": "...",
  "hsLastModifiedDate": "...",
  "enqueuedAt": "ISO timestamp"
}

Do not include PHI fields in Service Bus messages.

Task 3: Add a manual HTTP intake poller test function
Create a temporary manual HTTP-triggered function so we can test intake polling before enabling the timer.

Add:
src/functions/intakePollerHttpTest.mjs

Route:
POST /api/intake-poller-test

Behavior:
- Calls the same runIntakePollerWorkflow(context) used by the timer function.
- Returns only safe summary counts.
- Does not return HubSpot deal payloads.
- Does not return names, emails, phones, addresses, DOBs, or PHI.
- Does not create/update CentralReach clients.
- Does not run employee sync.
- If required intake dependencies are not configured (HubSpot/Cosmos/Service Bus env vars), fail fast with HTTP 500.
- In fail-fast mode, do not make any external network calls.
- In fail-fast mode, return only a safe error shape.

Expected success response shape:
{
  "ok": true,
  "summary": {
    "leaseAcquired": true,
    "candidatesFetched": 0,
    "skippedAlreadyProcessed": 0,
    "skippedShouldSyncFalse": 0,
    "messagesEnqueued": 0,
    "errorsCount": 0
  }
}

Expected fail-fast response shape (missing required env/config):
{
  "ok": false,
  "error": {
    "code": "MISSING_REQUIRED_CONFIG",
    "message": "Required intake poller configuration is missing"
  }
}
HTTP status: 500

This endpoint is for controlled testing only.

Task 4: Implement/complete these files as needed

Primary files likely involved:
- src/lib/hubspotClient.mjs
- src/lib/cosmosState.mjs
- src/lib/serviceBusClient.mjs
- src/workflows/intakePollerWorkflow.mjs
- src/functions/intakePoller.mjs
- src/functions/intakePollerHttpTest.mjs
- src/lib/config.mjs
- src/lib/safeLog.mjs
- src/lib/errors.mjs
- src/lib/retry.mjs
- README.md if documentation needs updating

HubSpot intake search requirements:
- Use HUBSPOT_BASE_URL
- Use HUBSPOT_PRIVATE_APP_TOKEN
- Search Deals through HubSpot CRM search API
- Use the exact pipeline/stage/filter logic from AWS
- Use the exact properties from AWS needed for intake queue decisions
- Preserve sorting/limit behavior from AWS
- Preserve shouldSync behavior from AWS
- Preserve max deals per run behavior from AWS
- Preserve dedupe semantics from AWS
- Preserve PHI-safe logging style from AWS

Cosmos state requirements:
- Use /pk partition key design already chosen
- Use item-level Cosmos TTL property: ttl
- Implement lease/lock behavior with create conflict handling
- Implement dedupe state with the same key semantics as AWS, translated to Cosmos
- Handle 409 conflict as "already exists / lease not acquired"
- Handle 404 as "not found"
- Do not store PHI in state records

Service Bus requirements:
- Use @azure/service-bus
- Use SERVICE_BUS_CONNECTION_STRING
- Use CLIENT_SYNC_QUEUE_NAME
- Enqueue only lightweight client sync messages
- Always set deterministic messageId derived from non-PHI values: dealId + hsLastModifiedDate
- Do not include full HubSpot records or PHI payloads in message body

Error handling requirements:
- Use retry helper for HubSpot transient failures.
- Retry only HTTP 429 and 5xx.
- Log safe error metadata only.
- Do not log request payloads or response bodies if they could include PHI.
- Return safe summary counts from workflow:
  - leaseAcquired
  - candidatesFetched
  - skippedAlreadyProcessed
  - skippedShouldSyncFalse
  - messagesEnqueued
  - errorsCount

Task 5: Keep production-ready structure
This should be production-ready code, not throwaway scaffold logic.

Production-ready means:
- no placeholder business logic for intake poller
- no fake responses
- no hardcoded IDs except harmless constants
- config-driven values from env vars
- safe structured logs
- deterministic dedupe keys
- lease release in finally block
- clear failure behavior
- no PHI in logs/state/queue messages

Task 6: Do not break local scaffold testing
The local HTTP functions should still load with placeholder local settings.
The timer and queue functions should remain disabled locally through local.settings.example.json.
Do not require real local secrets to run the connectivity scaffold test.

Clarification:
- Scaffold smoke testing remains connectivity-only and should work without real integration secrets.
- POST /api/intake-poller-test is an integration-path test and requires real intake env vars.
- Without required intake env vars, POST /api/intake-poller-test must fail fast with HTTP 500 and no external calls.

Task 7: Update README.md
Update README.md to clearly separate the stages:

A. Scaffold smoke test:
npm test
npm run start
curl -i http://localhost:7071/api/connectivity-test

B. Intake poller manual test:
After real local env values are configured in local.settings.json, run:
npm run start
curl -i -X POST http://localhost:7071/api/intake-poller-test

C. Deployment gate:
Do not deploy until the manual intake poller test confirms:
- HubSpot eligible deals can be fetched
- shouldSync logic runs
- Cosmos lease/dedupe state works
- Service Bus messages are enqueued
- no PHI appears in logs, state, or Service Bus messages

D. Deployment command later:
func azure functionapp publish centralreachfunction

E. Timer enablement:
Do not enable scheduled intake polling until after the deployed manual test endpoint succeeds in Azure.

Task 8: Add minimal tests if appropriate
If there is an existing test setup, add safe unit tests for:
- placeholder config validation
- dedupe key creation if exposed
- safe Service Bus message shape
- shouldSync logic if ported as an exported helper

Do not add tests requiring real HubSpot, CentralReach, Cosmos, or Service Bus credentials.

After completing changes:
1. Summarize which AWS files/functions were used as reference.
2. Summarize every Azure file changed.
3. Explain how AWS logic maps to Azure logic.
4. Confirm the only business logic adjustment is Service Bus enqueue.
5. Confirm no PHI/secrets are logged or stored.
6. Provide the next manual commands to run locally:
   npm test
   npm run start
   curl -i http://localhost:7071/api/connectivity-test
   curl -i -X POST http://localhost:7071/api/intake-poller-test