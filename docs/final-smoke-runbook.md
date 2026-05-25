# Final Smoke Runbook

This runbook verifies the operational Heads Up API loop without committing secrets.

For the full smoke matrix, expected D1 evidence, and release checklist, see [docs/api/smoke-test-suite.md](api/smoke-test-suite.md). For production incident diagnosis, see [docs/operations-runbook.md](operations-runbook.md).

## Rules

- Do not write real Slack webhook URLs, API keys, connector secrets, or tokens to repository files.
- Pass Slack webhook URLs at runtime with environment variables.
- Do not send Slack/webhook deliveries from ingest. Delivery must happen through the delivery path.
- Do not touch Foretic code or any other app.

## Local Quality Gates

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
```

Expected:

```text
all tests pass
load smoke accepts 10000 synthetic events
folded aggregate deltas are much fewer than raw deltas
```

## D1 Migration Validation

Local:

```bash
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --local --file "migrations/fresh/schema.sql"
```

Remote, only when the Cloudflare token has D1 import permissions:

```bash
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/fresh/schema.sql"
```

For older databases that predate this consolidated schema path, apply legacy patches once:

```bash
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0002_correctness_closure.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0003_channel_contracts_and_read_apis.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0004_watch_actions_and_quiet_summaries.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0005_correctness_closure_runtime.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0006_channel_metadata.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/legacy/0007_email_subscribers.sql"
```

Fresh installs should use only `migrations/fresh/schema.sql` to avoid duplicate-column errors from legacy `ALTER TABLE` patches.

After schema-changing stories, apply the remote migration before running deployed operator/admin features or deployed smokes.

## Observability Check

```bash
curl -H "Authorization: Bearer <operator token>" https://headsupp_app.martin-598.workers.dev/api/v1/observability/overview
```

Expected:

```text
response includes status, delivery counts, retry backlog, old pending counts, and scheduled_tasks health
response does not include raw event payloads, connector secrets, API keys, or full webhook URLs
```

## Foretic Slack Smoke

PowerShell:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:HEADSUPP_SMOKE_DISPATCH_SLACK='true'
npm run smoke:foretic
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:HEADSUPP_SMOKE_DISPATCH_SLACK
```

Expected:

```text
slack_subscriber_registered: true
aggregate_subscriber_registered: true
hmac_verified: true
raw_messages: 1
delivery.status: sent
delivery.response_code: 200
```

## Generic Slack Smoke

This is the core product smoke. It is not Foretic-specific.

PowerShell:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:generic-slack
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Expected:

```text
20 normal events are accepted with no Slack alert
1 trigger event is accepted
Slack receives: Generic smoke metric high is warning at 15.
alert delivery status becomes sent
```

## Generic Provisioning Smoke

This operator command provisions a generic workspace/channel/connector/signal/watch/subscriber and prints a safe setup summary.

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run provision:generic-smoke
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

## Alert Decision Smoke

This deployed smoke proves cooldown, escalation, and recovery.

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:alert-decisions
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Expected:

```text
first trigger creates one warning alert
second trigger inside cooldown creates no additional alert
higher-severity trigger creates one critical escalation alert
recovery value creates one recovery alert
repeated recovery value creates no additional alert
```

## Scheduled Watches Smoke

This deployed smoke proves cron-compatible watch work for missing expected, digest, and aggregate forwarding.

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:scheduled
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Expected:

```text
missing-expected creates one absence alert unless action controls suppress it
digest creates one digest alert and updates digest state
quiet summaries create quiet_summary_deliveries without creating alert rows when quiet_summary subscribers exist
aggregate-forward creates one delivery with delivery_id and dedupe_key
a later cron pass does not duplicate the same aggregate-forward delivery
```

## Dedicated Hardening Smokes

These deployed smokes cover the newer runtime features and proof gates:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:quiet-summary
npm run smoke:action-controls
npm run smoke:channel-contracts
npm run smoke:aggregate-forward-dimensions
npm run smoke:advanced-watches
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Operator observability also requires the operator secrets:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
$env:HEADSUPP_BOOTSTRAP_TOKEN='<runtime bootstrap token>'
$env:HEADSUPP_OPERATOR_TOKEN='<runtime operator token>'
npm run smoke:operator-observability
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:HEADSUPP_BOOTSTRAP_TOKEN
Remove-Item Env:HEADSUPP_OPERATOR_TOKEN
```

## Delivery Retry Smoke

This deployed smoke proves retry and permanent failure handling with test HTTP status endpoints.

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:delivery-retry
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Expected:

```text
transient 500 response stores delivery as retrying
retrying delivery becomes sent after destination changes to 200
permanent 404 response stores delivery as failed
retry processing does not duplicate the alert
```

## Email Subscriber Smoke

This deployed smoke provisions an email subscriber and triggers one simple coffee alert (`LAST_VALUE_GT` on `coffee.highest_purchase`).

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@inc64.com'
npm run smoke:email-subscriber
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_DESTINATION
```

Expected:

```text
normal value events create zero alerts
trigger event (> threshold) creates one warning alert
latest alert delivery status becomes sent for subscriber_type email
email subject/heading uses the configured title template: Highest coffee purchase: $9.50
```

## Tenant Isolation Smoke

This deployed smoke proves two tenants can share a signal key without crossing aggregates, alerts, or deliveries.

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:tenant-isolation
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

## Release Soak Test

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SOAK_DURATION_SECONDS='60'
$env:HEADSUPP_SOAK_INTERVAL_MS='5000'
$env:HEADSUPP_SOAK_EVENTS_PER_TICK='1500'
npm run soak:release
Remove-Item Env:HEADSUPP_SOAK_DURATION_SECONDS
Remove-Item Env:HEADSUPP_SOAK_INTERVAL_MS
Remove-Item Env:HEADSUPP_SOAK_EVENTS_PER_TICK
```

Expected:

```text
ok: true
summary.total_events > 0
summary.fold_compression_ratio < 1
summary.throughput_events_per_second > 0
```

## Deploy

```bash
cd apps/headsupp-api
npm run deploy
```

After deploy, repeat the smoke against the deployed Worker by provisioning a forecast watch through `POST /api/function`, storing the returned one-time connector secret outside the repo, signing one `forecast_state` event, and sending it to `/v1/events/{connector_key}`.

## Final Secret Scan

Before sharing results:

```text
search for the real Slack token fragments
search for hooks.slack.com/services
search for connector secret prefixes
```

Only fake `T_TEST` examples and placeholders should remain in tracked files.
