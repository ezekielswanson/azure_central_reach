You are working in the Azure Functions repo: azure_central_reach.

Goal:
Build the full production-ready Employee Sync for BT/RBT and BCBA.

Canonical AWS source of business logic:
Always use the AWS repo GitHub main branch as the canonical source of business logic:
https://github.com/ezekielswanson/aws_code/tree/main

Treat the AWS repo as read-only.
Do not modify the AWS repo.
Only create/edit files in the current Azure repo.

Current Azure production path status:
- Intake poller timer trigger works.
- Intake poller finds eligible HubSpot records.
- Intake poller writes Cosmos lease/dedupe state.
- Intake poller enqueues Service Bus messages.
- processClientQueue consumes client sync messages.
- runClientSyncWorkflow runs successfully.
- Client sync production path is now functional.

Build order:
1. Intake poller: complete
2. Client sync: complete enough for production-level testing
3. Employee sync: build now

Important:
This is a full production-ready employee sync build.
Do not implement mock logic.
Do not return fake success.
Do not build scaffold-only behavior.
Do not add temporary HTTP test functions unless explicitly asked.
Production behavior must run through the Azure production functions.

Production employee path target:
HubSpot BT/RBT and BCBA eligible records
→ Azure employee sync logic
→ CentralReach employee create/update
→ HubSpot employee_id writeback
→ Cosmos safe sync state

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
- src/functions/processEmployeeQueue.mjs
- src/workflows/employeeSyncWorkflow.mjs
- src/lib/hubspotClient.mjs
- src/lib/centralReachClient.mjs
- src/mappings/employees/buildEmployeePayload.mjs
- src/mappings/employees/validateEmployeePayload.mjs

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
- src/constants/queues.mjs
- README.md
- tests related to employee sync

Do not edit unless absolutely necessary:
- src/functions/intakePoller.mjs
- src/functions/intakePollerHttpTest.mjs
- src/workflows/intakePollerWorkflow.mjs
- src/functions/processClientQueue.mjs
- src/workflows/clientSyncWorkflow.mjs
- src/lib/serviceBusClient.mjs
- src/mappings/client/*

Never edit:
- local.settings.json

Task 1: Inspect AWS employee sync logic first
Use https://github.com/ezekielswanson/aws_code/tree/main as the canonical source.

Find and carry over the AWS logic for:
- BT/RBT custom object sync
- BCBA custom object sync
- HubSpot object type IDs
- HubSpot pipeline/stage filters
- allowed stages
- object property lists
- employee create/update behavior
- CentralReach employee endpoint behavior
- ExternalSystemId behavior
- employee_id writeback to HubSpot
- ALLOW_EMPLOYEE_CREATE behavior
- integration_last_write logic
- last_sync_hash logic
- last_sync_at logic
- last_sync_status logic
- last_sync_error logic
- retry/backoff behavior
- validation rules
- mapping/transformation rules
- PHI-safe logging

Do not invent new employee sync business logic. Port the AWS behavior.

Task 2: Implement processEmployeeQueue
Update src/functions/processEmployeeQueue.mjs.

Expected Service Bus message shape:
{
  "workflow": "employeeSync",
  "source": "employeePoller",
  "employeeType": "bt_rbt" or "bcba",
  "recordId": "...",
  "hsLastModifiedDate": "...",
  "enqueuedAt": "ISO timestamp"
}

Requirements:
- Validate recordId.
- Validate employeeType is either bt_rbt or bcba.
- Validate workflow is employeeSync when present.
- Do not log full message body.
- Call runEmployeeSyncWorkflow({ recordId, employeeType, hsLastModifiedDate, context }).
- If validation fails, throw safe error so Service Bus retry/dead-letter behavior can handle the message.
- If runEmployeeSyncWorkflow fails, rethrow.
- Never silently consume invalid or failed messages.

Use:
connection: "SERVICE_BUS_CONNECTION_STRING"
queueName: process.env.EMPLOYEE_SYNC_QUEUE_NAME || "employee-sync-queue"

Task 3: Implement runEmployeeSyncWorkflow
Update src/workflows/employeeSyncWorkflow.mjs.

It should:
- accept { recordId, employeeType, hsLastModifiedDate, context }
- validate recordId and employeeType
- load config from process.env through config.mjs
- initialize HubSpot client
- initialize CentralReach client
- initialize Cosmos state client
- fetch required HubSpot custom object record by recordId
- build CentralReach employee payload using AWS mapping logic
- validate mapped payload
- apply AWS idempotency/hash logic
- respect ALLOW_EMPLOYEE_CREATE
- create/update CentralReach employee according to AWS logic
- write CentralReach employee contactId back to HubSpot property employee_id
- write safe operational state to Cosmos
- return safe summary only

Safe summary should not include PHI or full payloads.

Task 4: Implement HubSpot helpers for employee sync
Update src/lib/hubspotClient.mjs as needed.

Implement only the helpers required by AWS employee sync logic:
- fetch BT/RBT record by ID
- fetch BCBA record by ID
- search eligible BT/RBT records if AWS has poller logic
- search eligible BCBA records if AWS has poller logic
- update custom object properties
- write employee_id back to the correct HubSpot custom object

Use retry for 429/5xx.
Do not log full API responses.

Task 5: Implement CentralReach helpers for employee sync
Update src/lib/centralReachClient.mjs as needed.

Implement according to AWS logic:
- getCentralReachAccessToken if shared auth needs updates
- create/update employee
- update employee by ExternalSystemId if AWS uses that
- handle create-vs-update according to AWS behavior

Never log OAuth tokens, API keys, client secrets, or full response bodies.

Task 6: Implement employee mapping files
Update:
- src/mappings/employees/buildEmployeePayload.mjs
- src/mappings/employees/validateEmployeePayload.mjs

Carry over AWS mapping behavior exactly for:
- BT/RBT
- BCBA
- required fields
- optional fields
- phone/date/name/email transformations if used
- ExternalSystemId
- employee_id writeback field

Do not invent new mappings.

Task 7: Determine whether an employee poller is required
Inspect AWS main branch to determine how employee sync is triggered.

If AWS has scheduled/poller logic for BT/RBT and BCBA:
- Implement the Azure equivalent production trigger only if needed.
- Prefer matching the existing Azure architecture by enqueueing lightweight messages into EMPLOYEE_SYNC_QUEUE_NAME.
- Message body must contain only non-PHI operational identifiers:
  {
    "workflow": "employeeSync",
    "source": "employeePoller",
    "employeeType": "bt_rbt" or "bcba",
    "recordId": "...",
    "hsLastModifiedDate": "...",
    "enqueuedAt": "ISO timestamp"
  }

If adding a new employee poller function is required, propose the exact file/function first in your summary before implementing broad new architecture.

Task 8: Cosmos state/idempotency
Use Cosmos DB to replace DynamoDB state for employee sync:
- preserve AWS idempotency/hash logic
- use item-level ttl
- store only non-PHI operational metadata
- do not store full HubSpot payloads
- do not store full CentralReach payloads

Task 9: Preserve working intake and client sync
After changes, these must still work:
- GET /api/connectivity-test
- POST /api/intake-poller-test
- timer function intakePoller
- processClientQueue
- runClientSyncWorkflow

Do not change intake poller or client sync behavior unless explicitly required and explained.

Task 10: Tests
Add safe tests where practical for:
- employee queue message validation
- BT/RBT payload mapping with fake non-PHI data
- BCBA payload mapping with fake non-PHI data
- employee validation
- ALLOW_EMPLOYEE_CREATE behavior
- hash/idempotency helper behavior if exported
- employee workflow behavior with mocked dependencies

No tests should require real HubSpot, CentralReach, Cosmos, or Service Bus credentials.
No tests should use PHI.

Task 11: README update
Update README.md with Employee Sync testing stages.

Document:
- Keep AzureWebJobs.processEmployeeQueue.Disabled=true until employee sync is implemented.
- After implementation, full production-level local test can use:
  AzureWebJobs.intakePoller.Disabled=false
  AzureWebJobs.processClientQueue.Disabled=false
  AzureWebJobs.processEmployeeQueue.Disabled=false
- Keep employee poller guidance aligned with AWS main branch behavior.
- Canonical AWS business logic reference is always:
  https://github.com/ezekielswanson/aws_code/tree/main

After completing changes, summarize:
1. AWS files/functions referenced from https://github.com/ezekielswanson/aws_code/tree/main
2. Azure files changed
3. Exact AWS employee sync logic carried over
4. Azure-specific replacements made
5. Whether an employee poller was needed
6. How to manually/prod-level test employee sync
7. Confirm no secrets/PHI are logged, stored, or returned