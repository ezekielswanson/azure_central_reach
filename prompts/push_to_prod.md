You are working in the Azure Functions repo: azure_central_reach.

Goal:
Prepare and deploy the current working Azure Functions integration to the existing Azure Function App.

Repo:
https://github.com/ezekielswanson/azure_central_reach

Canonical AWS business logic reference:
https://github.com/ezekielswanson/aws_code/tree/main

Azure target:
- Subscription name: Azure subscription 1
- Subscription ID: 66012b95-3c9c-4527-b5b6-32b6d4cb012c
- Resource group: central_reach_integration
- Function App name: centralreachfunction

Production deployment path:
intakePoller timer
→ Service Bus queues
→ processClientQueue / processEmployeeQueue
→ runClientSyncWorkflow / runEmployeeSyncWorkflow
→ HubSpot + CentralReach + Cosmos

Important:
This is a production deployment pass.
Do not modify business logic.
Do not edit local.settings.json.
Do not print secrets.
Do not print Azure app setting values.
Do not print connection strings, tokens, API keys, client secrets, or local.settings.json values.
Do not run destructive Azure commands.
Do not delete Azure resources.
Do not force push.
Do not enable HTTP test endpoints in Azure production.

Production function policy:
Enable production functions:
- intakePoller
- processClientQueue
- processEmployeeQueue

Disable local/debug HTTP functions in Azure:
- connectivityTest
- intakePollerHttpTest
- clientSyncHttpTest

Reason:
The HTTP functions are useful for local diagnostics, but they are not part of the live production path. Keep them in the repo for future local testing, but disable them in Azure production.

Step 1: Show repo state safely

Run:

git branch --show-current
git status --short

Confirm:
- local.settings.json is not staged
- .env is not staged
- no secret files are staged

If local.settings.json or .env appears in git status, stop and warn me.

Step 2: Install and test locally

Run:

npm install
npm test

If tests fail, stop and summarize the failing test/error safely.

Step 3: Confirm Azure CLI account

Run:

az account show --query "{subscriptionName:name, subscriptionId:id, tenantId:tenantId, isDefault:isDefault, state:state}" --output table

If subscriptionId is not 66012b95-3c9c-4527-b5b6-32b6d4cb012c, run:

az account set --subscription "66012b95-3c9c-4527-b5b6-32b6d4cb012c"

Then rerun:

az account show --query "{subscriptionName:name, subscriptionId:id, tenantId:tenantId, isDefault:isDefault, state:state}" --output table

Step 4: Confirm Function App exists

Run:

az functionapp show \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --query "{name:name,state:state,location:location,defaultHostName:defaultHostName}" \
  --output table

If this fails, stop and summarize the safe error only.

Step 5: Compare local.settings.json keys to Azure App Setting names

Important:
Compare names only.
Do not print values.
Do not print secrets.
Do not dump local.settings.json.
Do not dump Azure app setting values.

Create a temporary local names-only comparison using commands that output setting names only.

Run this to list local setting names only:

node -e 'const fs=require("fs"); const p="local.settings.json"; if(!fs.existsSync(p)){console.error("local.settings.json not found"); process.exit(1);} const j=JSON.parse(fs.readFileSync(p,"utf8")); const keys=Object.keys(j.Values||{}).sort(); console.log(keys.join("\n"));' > /tmp/local-azure-function-setting-names.txt

Run this to list Azure setting names only:

az functionapp config appsettings list \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --query "[].name" \
  --output tsv | sort > /tmp/azure-function-setting-names.txt

Compare names:

echo "Missing in Azure:"
comm -23 /tmp/local-azure-function-setting-names.txt /tmp/azure-function-setting-names.txt

echo "Extra in Azure:"
comm -13 /tmp/local-azure-function-setting-names.txt /tmp/azure-function-setting-names.txt

Required production setting names include at minimum:
- AzureWebJobsStorage
- FUNCTIONS_WORKER_RUNTIME
- CR_CLIENT_ID
- CR_CLIENT_SECRET
- CR_API_KEY
- HUBSPOT_PRIVATE_APP_TOKEN
- CR_BASE_URL
- CR_TOKEN_URL
- HUBSPOT_BASE_URL
- HS_DEAL_PIPELINE_ID
- HS_STAGE_ALLOWLIST_JSON
- HUBSPOT_CR_CONTACT_ID_PROPERTY
- HS_BCBA_STAGE_ALLOWLIST_JSON
- HS_BCBA_PIPELINE_ID
- HS_BT_RBT_OBJECT_TYPE_ID
- HS_BT_RBT_PIPELINE_ID
- MAX_DEALS_PER_RUN
- MAX_BT_RBT_PER_RUN
- MAX_BCBA_PER_RUN
- DEDUPE_TTL_SECONDS
- LEASE_TTL_SECONDS
- SUCCESS_TTL_SECONDS
- FAIL_TTL_SECONDS
- STATE_PROVIDER
- COSMOS_ENDPOINT
- COSMOS_KEY
- COSMOS_DATABASE_ID
- COSMOS_CONTAINER_ID
- STATE_TTL_ATTR
- SERVICE_BUS_CONNECTION_STRING
- CLIENT_SYNC_QUEUE_NAME
- EMPLOYEE_SYNC_QUEUE_NAME

Also required function enable/disable setting names:
- AzureWebJobs.intakePoller.Disabled
- AzureWebJobs.processClientQueue.Disabled
- AzureWebJobs.processEmployeeQueue.Disabled
- AzureWebJobs.clientSyncHttpTest.Disabled
- AzureWebJobs.intakePollerHttpTest.Disabled
- AzureWebJobs.connectivityTest.Disabled

Important:
Do not copy AzureWebJobsStorage value from local.settings.json if it is UseDevelopmentStorage=true. Azure production must use the actual Azure Storage connection string / configured storage setting, not local Azurite.

If any required names are missing in Azure, stop and report only the missing setting names. Tell me to add the missing values manually in:
Azure Portal → Function App → centralreachfunction → Environment variables → App settings

Do not ask me to paste secrets into chat.
Do not print local values.
Do not auto-copy secrets from local.settings.json to Azure unless I explicitly approve a separate secure process.

Step 6: Set production function enable/disable flags

Run:

az functionapp config appsettings set \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --settings \
  AzureWebJobs.intakePoller.Disabled=false \
  AzureWebJobs.processClientQueue.Disabled=false \
  AzureWebJobs.processEmployeeQueue.Disabled=false \
  AzureWebJobs.clientSyncHttpTest.Disabled=true \
  AzureWebJobs.intakePollerHttpTest.Disabled=true \
  AzureWebJobs.connectivityTest.Disabled=true

Do not print app setting values after this command.

Step 7: Optional restore point before deploy

Run:

git status --short

If there are local code changes that are ready and no secret files are staged, commit and push:

git add .
git commit -m "Prepare Azure production deployment"
git push

If there are no changes to commit, continue.
If git status shows local.settings.json, .env, or any secret file, stop.

Step 8: Publish to Azure

Run:

func azure functionapp publish centralreachfunction

If publish fails, stop and summarize:
- failing command
- safe error message only
Do not print secrets.

Step 9: Restart Function App

Run:

az functionapp restart \
  --name centralreachfunction \
  --resource-group central_reach_integration

Then verify state:

az functionapp show \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --query "{name:name,state:state,defaultHostName:defaultHostName}" \
  --output table

Step 10: Confirm deployed functions and disabled flags

List function names:

az functionapp function list \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --query "[].name" \
  --output table

Confirm intended production policy:
Enabled:
- intakePoller
- processClientQueue
- processEmployeeQueue

Disabled:
- connectivityTest
- intakePollerHttpTest
- clientSyncHttpTest

If any debug HTTP endpoint appears to be enabled, stop and set it disabled.

Step 11: Stream logs for first production timer cycle

Run:

func azure functionapp logstream centralreachfunction

Watch for:
- intakePoller execution
- intakePoller safe summary
- messagesEnqueued
- processClientQueue accepting and processing messages
- processEmployeeQueue accepting and processing messages if employee messages are queued
- runClientSyncWorkflow success
- runEmployeeSyncWorkflow success if employee queue messages exist

Expected safe success patterns:
- intakePoller finished
- errorsCount: 0
- processClientQueue processed message
- client sync success/noop
- processEmployeeQueue processed message if employee queue has messages
- employee sync success/noop/blocked according to configured employee create rules

Safety checks:
- no secrets in logs
- no PHI in logs
- no full HubSpot payloads in logs
- no full CentralReach payloads in logs
- no raw Service Bus message bodies in logs
- no local.settings.json values printed

If processClientQueue or processEmployeeQueue shows repeated failures:
1. Disable the failing queue trigger immediately.

For client queue failures:

az functionapp config appsettings set \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --settings AzureWebJobs.processClientQueue.Disabled=true

For employee queue failures:

az functionapp config appsettings set \
  --name centralreachfunction \
  --resource-group central_reach_integration \
  --settings AzureWebJobs.processEmployeeQueue.Disabled=true

2. Summarize the safe error details only.
3. Do not print secrets or PHI.

Step 12: Final deployment summary

After deployment and initial log verification, summarize:
1. Git branch deployed
2. Whether npm test passed
3. Whether Azure app settings parity check passed by name
4. Which Function App was published
5. Which functions are enabled
6. Which functions are disabled
7. Whether publish succeeded
8. Whether Function App restarted successfully
9. Whether intakePoller ran
10. Whether processClientQueue ran
11. Whether processEmployeeQueue ran, if applicable
12. Any safe errors
13. Confirmation that no secrets/PHI were printed