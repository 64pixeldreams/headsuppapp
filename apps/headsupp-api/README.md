# Heads Up API

Heads Up Core API is an operational Cloudflare Worker app.

It uses the vendored CFKit framework for the control plane and direct Cloudflare primitives for the event engine.

Heads Up is proprietary software. The intellectual property is owned by 64 Pixel Holdings LLC and operated by Inc64 LLC. See `../../LICENSE`.

## Local Structure

```text
apps/headsupp-api/
  src/
    index.js
    functions/
    durable/
  test/
  package.json
  wrangler.toml
```

CFKit is vendored at:

```text
../../cfkit
```

## Current Endpoints

```text
GET /health
GET /api/v1/health
GET /api/v1/observability/overview
POST /api/function
POST /v1/events/{connector_key}
```

The ingest endpoint validates connector HMAC, queues raw events, and returns `202 Accepted`.

## Test Loop

Run:

```bash
npm run check
npm run load:smoke
```

Cursor should not move on from a story while tests are failing.

## Foretic Smoke

Use a runtime environment variable for the Slack webhook. Do not write real Slack URLs into repo files.

```powershell
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:HEADSUPP_SMOKE_DISPATCH_SLACK='true'
npm run smoke:foretic
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:HEADSUPP_SMOKE_DISPATCH_SLACK
```

See [../../docs/final-smoke-runbook.md](../../docs/final-smoke-runbook.md) for the full closure runbook.

## Generic Slack Smoke

Use this as the core deployed proof that Heads Up suppresses normal events and alerts only on a meaningful threshold breach.

```powershell
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:generic-slack
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

## Cloudflare Resources

The app is configured for Heads Up-scoped resources:

```text
Worker: headsupp_app
D1: headsup_db
Queues:
  headsup-raw-events
  headsup-alert-delivery
  headsup-aggregate-delivery
KV:
  HEADSUPP_USERS
  HEADSUPP_SESSIONS
  HEADSUPP_CACHE
  HEADSUPP_EMAILS
  HEADSUPP_KEYS
  HEADSUPP_LISTS
Durable Object:
  WATCH_EVALUATOR
```

The KV namespace IDs and queue names have been wired into `wrangler.toml`.

The D1 database is configured as `headsup_db`. If remote migration fails with Cloudflare auth code `10000`, update the active API token permissions and retry the non-destructive migration command from the runbook.
