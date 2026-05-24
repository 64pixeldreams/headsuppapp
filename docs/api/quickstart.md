# Heads Up API Quickstart

This is the practical guide for using the current Heads Up API.

For a fuller endpoint and payload reference, see `reference.md`. For release proof commands, see `smoke-test-suite.md`.

## Base URL

Local:

```text
http://localhost:8787
```

Deployed:

```text
https://headsupp_app.martin-598.workers.dev
```

## Core Flow

```text
workspace -> channel -> connector -> signal -> watch -> subscriber
event -> queue -> aggregate -> watch evaluation -> alert delivery
```

Heads Up does not alert on every event. Ingest validates and queues events, then watches evaluate aggregate rows.

## Health

```bash
curl https://headsupp_app.martin-598.workers.dev/health
```

Expected:

```json
{
  "status": "ok",
  "app": "headsupp_app",
  "framework": "CFKit",
  "role": "attention-processing-api"
}
```

## Control Plane

Control-plane actions use CFKit through:

```text
POST /api/function
Authorization: Bearer <api_key>
Content-Type: application/json
```

Request shape:

```json
{
  "action": "admin.createWorkspace",
  "payload": {}
}
```

Current admin actions:

```text
admin.createWorkspace
admin.createChannel
admin.createConnector
admin.createSubscriber
admin.createSignal
admin.createWatch
```

Required permissions:

```text
workspace:create
channel:create
connector:create
subscriber:create
signal:create
watch:create
```

If no service key exists yet, create one through the operator bootstrap action with a runtime-only `X-HeadsUp-Bootstrap-Token` header. The returned `api_key` is shown once and must be stored outside the repo.

## Create Resources

Create a workspace:

```json
{
  "action": "admin.createWorkspace",
  "payload": {
    "name": "Demo Workspace",
    "source_app": "headsupp-demo",
    "external_tenant_id": "demo-tenant",
    "external_user_id": "demo-user"
  }
}
```

Create a channel:

```json
{
  "action": "admin.createChannel",
  "payload": {
    "workspace_id": "ws_...",
    "name": "Demo Channel",
    "purpose": "Smoke test events"
  }
}
```

Create a connector:

```json
{
  "action": "admin.createConnector",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "connector_type": "webhook"
  }
}
```

The connector response includes `connector_key` and the one-time `connector_secret`. Store the secret outside the repo.

The connector can be used immediately after creation because admin provisioning writes both D1 metadata and the KV lookup used by event ingest.

Create a signal:

```json
{
  "action": "admin.createSignal",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "signal_key": "demo.metric",
    "signal_type": "metric",
    "value_mode": "last",
    "contract": {
      "default_bucket_types": ["minute", "hour"],
      "dimensions": ["source"]
    }
  }
}
```

Create a watch:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "signal_id": "sig_...",
    "name": "Demo metric high",
    "watch_type": "LAST_VALUE_GT",
    "config": {
      "threshold": 10,
      "severity": "warning",
      "bucket_type": "minute"
    },
    "cooldown_seconds": 3600
  }
}
```

Create a Slack subscriber:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "subscriber_type": "slack_webhook",
    "destination_url": "<runtime Slack webhook URL>",
    "mode": "alert"
  }
}
```

Do not commit real Slack webhook URLs.

## Event Ingest

Events are sent to:

```text
POST /v1/events/{connector_key}
Content-Type: application/json
X-HeadsUp-Timestamp: <ISO timestamp>
X-HeadsUp-Signature: sha256=<hmac>
```

HMAC message:

```text
<timestamp>.<raw JSON body>
```

Payload:

```json
{
  "idempotency_key": "evt_001",
  "signal_key": "demo.metric",
  "occurred_at": "2026-05-24T17:20:00.000Z",
  "value": {
    "num": 15
  },
  "fields": {
    "source": "demo"
  },
  "cta": {
    "label": "View",
    "url": "https://example.com",
    "kind": "review"
  }
}
```

Batch payload:

```json
{
  "events": [
    {
      "idempotency_key": "evt_001",
      "signal_key": "demo.metric",
      "occurred_at": "2026-05-24T17:20:00.000Z",
      "value": { "num": 5 },
      "fields": { "source": "demo" }
    }
  ]
}
```

Accepted response:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_..."
}
```

## Observability

```bash
curl https://headsupp_app.martin-598.workers.dev/api/v1/observability/overview
```

This returns operational counts for active watches, aggregate rows, alerts, and delivery states. It does not return raw event payloads or subscriber secrets.

## Smoke Test

The generic Slack smoke proves the useful loop:

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
```

The alert decision smoke proves cooldown, escalation, and recovery:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:alert-decisions
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

Additional deployed proof smokes:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

These prove scheduled watch evaluation, aggregate forwarding, retry/backoff, permanent webhook failure handling, and tenant isolation for shared signal keys.

For the full smoke matrix and minimum release checklist, see `smoke-test-suite.md`.

For operator-only generic provisioning without sending events:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run provision:generic-smoke
Remove-Item Env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
Remove-Item Env:CLOUDFLARE_API_TOKEN
```
