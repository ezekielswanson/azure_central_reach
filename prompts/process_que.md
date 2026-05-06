You are working in the Azure Functions repo: azure_central_reach.

Goal:
Implement the production-ready Azure Service Bus queue trigger for client sync:
src/functions/processClientQueue.mjs

This is part of the full production-level test path:

Azure timer trigger intakePoller
→ Cosmos lease/dedupe
→ Service Bus enqueue
→ processClientQueue Service Bus trigger
→ runClientSyncWorkflow
→ HubSpot fetch
→ CentralReach create/update
→ HubSpot writeback

Canonical AWS source of business logic:
Always use the AWS repo GitHub main branch as the canonical source of business logic:
https://github.com/ezekielswanson/aws_code/tree/main

Treat the AWS repo as read-only.
Do not modify the AWS repo.
Only create/edit files in the current Azure repo.

Current Azure status:
Phase 1 intake poller is working.
The actual timer path has been tested and succeeded.
The intake poller can enqueue lightweight Service Bus messages.

Pre-Implementation Clarification Gate (applies to Task 1 through Task 10):
- If any requirement, assumption, dependency, or expected behavior is unclear, ask clarifying questions before implementation.
- Ask all clarifying questions needed to complete the implementation in full before writing code or editing files.
- Do not start partial implementation while clarification is pending.
- Do not run implementation commands while clarification is pending.
- If responses are incomplete or create new ambiguity, ask follow-up clarifying questions and continue to block implementation.
- Only begin implementation after all required clarifications are answered.

Important:
This is a production-ready queue trigger implementation, not a mock.
Do not silently consume messages without syncing.
Do not return fake success.
Do not build throwaway scaffold logic.

Safety/compliance rules:
- Do not hardcode secrets.
- Do not print secrets.
- Do not print PHI.
- Do not log names, emails, phone numbers, addresses, DOBs, payload bodies, HubSpot full records, or CentralReach full responses.
- Do not put PHI in Service Bus messages.
- Do not edit local.settings.json.
- Do not add real values to local.settings.example.json.
- Do not deploy.
- Do not run Azure CLI commands.

Exact files allowed to edit for this task:

Primary file:
- src/functions/processClientQueue.mjs

Allowed support files only if required:
- src/workflows/clientSyncWorkflow.mjs
- src/lib/safeLog.mjs
- src/lib/errors.mjs
- src/lib/validation.mjs
- src/constants/queues.mjs
- README.md
- tests related specifically to processClientQueue

Do not edit unless absolutely required:
- src/functions/intakePoller.mjs
- src/functions/intakePollerHttpTest.mjs
- src/workflows/intakePollerWorkflow.mjs
- src/lib/serviceBusClient.mjs
- src/lib/hubspotClient.mjs
- src/lib/centralReachClient.mjs
- src/mappings/client/*
- local.settings.example.json

Never edit:
- local.settings.json

Task 1: Inspect current Azure queue trigger
Inspect:
- src/functions/processClientQueue.mjs
- src/workflows/clientSyncWorkflow.mjs

Current problem:
processClientQueue may still be placeholder-style code. It must not just log “workflow pending implementation” and complete the message.

Task 2: Implement production-ready processClientQueue behavior
Update src/functions/processClientQueue.mjs so it:

1. Accepts the Azure Service Bus message from the queue trigger.
2. Safely parses the message body.
3. Validates the message shape.
4. Extracts:
   - dealId
   - hsLastModifiedDate, optional but expected from intake poller
   - workflow
   - source
   - enqueuedAt
5. Calls:
   runClientSyncWorkflow({ dealId, hsLastModifiedDate, context })

Expected intake poller Service Bus message shape:
{
  "workflow": "clientSync",
  "source": "intakePoller",
  "dealId": "...",
  "hsLastModifiedDate": "...",
  "enqueuedAt": "ISO timestamp"
}

Task 3: Message validation requirements
Implement validation so:

Required:
- dealId must exist and be non-empty.
- workflow, if present, should be "clientSync".
- source, if present, should be "intakePoller" or another safe source string.
- hsLastModifiedDate may be optional, but if present should be passed to runClientSyncWorkflow.

If dealId is missing:
- Log a safe warning with no raw body.
- Throw an Error so the Service Bus message is not silently completed.
- This allows Azure Functions/Service Bus retry and dead-letter behavior to handle the bad message.

If workflow is present but not "clientSync":
- Log a safe warning with only non-PHI fields.
- Throw an Error.

If message parsing fails:
- Log a safe warning.
- Throw an Error.

Do not log the full raw message body.

Task 4: Safe logging
Use safeLog and buildErrorLog if available.

Allowed safe log metadata:
- functionName
- invocationId
- dealId
- hsLastModifiedDate
- workflow
- source
- messageId if Azure exposes it
- deliveryCount if Azure exposes it
- enqueuedTimeUtc if Azure exposes it

Forbidden log metadata:
- full message body
- HubSpot deal properties
- CentralReach payloads
- names
- emails
- phones
- addresses
- DOBs
- tokens
- secrets
- API keys

Task 5: Error behavior
Production behavior:
- Invalid message: throw safe error after safe log.
- runClientSyncWorkflow failure: log safe error and rethrow.
- Successful run: log safe completion summary only.

Do not catch and swallow errors.
Do not return success if client sync fails.
Do not complete bad messages silently.

Task 6: Client sync workflow contract
If runClientSyncWorkflow is still not implemented, do not fake it.

Acceptable behavior:
- processClientQueue imports and calls runClientSyncWorkflow.
- If runClientSyncWorkflow still throws "not implemented yet", processClientQueue should rethrow so the message is not silently consumed.
- Do not mark the Service Bus message as successfully processed when the workflow is not implemented.

Task 7: Azure queue trigger configuration
Ensure app.serviceBusQueue uses:
- connection: "SERVICE_BUS_CONNECTION_STRING"
- queueName: process.env.CLIENT_SYNC_QUEUE_NAME || "client-sync-queue"

Do not use "client-sync" as fallback.
The actual queue name is:
client-sync-queue

Task 8: Add tests if existing test structure supports it
Add safe unit tests for message parsing/validation if practical.

Test cases:
- valid message calls workflow with dealId and hsLastModifiedDate
- missing dealId throws
- invalid JSON/string body throws
- wrong workflow throws
- no raw body is required in expected logs

Tests must not require real HubSpot, CentralReach, Cosmos, or Service Bus credentials.
Tests must not use PHI.

Task 9: README update
Update README.md with a short "Client Queue Trigger" section.

Document:
- processClientQueue is the production Service Bus trigger path.
- Keep AzureWebJobs.processClientQueue.Disabled=true until runClientSyncWorkflow is fully implemented.
- Once client sync is built, full production-level local test uses:
  AzureWebJobs.intakePoller.Disabled=false
  AzureWebJobs.processClientQueue.Disabled=false
  AzureWebJobs.processEmployeeQueue.Disabled=true
- processClientQueue should never silently consume messages without syncing.
- Invalid queue messages should fail safely and rely on Service Bus retry/dead-letter behavior.
- Canonical AWS business logic reference is always:
  https://github.com/ezekielswanson/aws_code/tree/main

Task 10: Do not break existing functionality
After changes, these should still load:
- GET /api/connectivity-test
- POST /api/intake-poller-test
- timer function intakePoller

Do not change intake poller behavior.

After completing changes, summarize:
1. Azure files changed
2. Whether any AWS files/functions were referenced from https://github.com/ezekielswanson/aws_code/tree/main
3. How processClientQueue now handles valid messages
4. How processClientQueue now handles invalid messages
5. Whether it calls runClientSyncWorkflow
6. Whether errors are rethrown for retry/dead-letter behavior
7. Confirm no secrets/PHI are logged, stored, or returned
8. Manual commands to run:
   npm test
   npm run start
   curl -i http://localhost:7071/api/connectivity-test