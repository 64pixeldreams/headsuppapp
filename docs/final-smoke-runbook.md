# Final Smoke Runbook

This runbook verifies the Heads Up MVP loop without committing secrets.

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
npx wrangler d1 execute headsup_db --local --file "migrations/0001_headsupp_core.sql"
```

Remote, only when the Cloudflare token has D1 import permissions:

```bash
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/0001_headsupp_core.sql"
```

The migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

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
