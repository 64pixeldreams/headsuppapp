# Heads Up API Quickstart

This guide walks through the first working Heads Up integration from API key to signed event.

You will create:

```text
workspace -> channel -> connector -> signal -> watch -> subscriber
```

Then you will send one signed event and verify the API accepted it.

For Node or Cloudflare Workers, prefer the wrapper in `node-cloudflare-client.md`. For Foretic, use `foretic-wrapper-guide.md`.

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

## Response Shape

Control-plane actions return this envelope:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "workspace": {
      "workspace_id": "ws_demo"
    }
  }
}
```

If something fails:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Permission is required.",
    "status": 403
  }
}
```

Event ingest returns a different envelope because it is asynchronous:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_demo"
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
admin.createChannelContract
admin.updateChannelContract
admin.getChannelContract
admin.listChannelContractVersions
admin.listChannelAlerts
admin.getWatchState
admin.listAlertTimeline
admin.snoozeWatch
admin.muteWatch
admin.resumeWatch
admin.ignoreAlert
```

Required permissions:

```text
workspace:create
channel:create
connector:create
subscriber:create
signal:create
watch:create
alert:read
watch:read
watch:control
```

Optional channel-contract permissions:

```text
channel_contract:create
channel_contract:update
channel_contract:read
```

If no service key exists yet, create one through the operator bootstrap action with a runtime-only `X-HeadsUp-Bootstrap-Token` header. The returned `api_key` is shown once and must be stored outside the repo.

## Step 1: Create A Workspace

What it does: creates the top-level tenant container.

Permission: `workspace:create`.

Request:

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

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "workspace": {
      "id": "ws_demo",
      "workspace_id": "ws_demo",
      "workspace_key": "headsupp-demo:demo_workspace",
      "name": "Demo Workspace",
      "source_app": "headsupp-demo",
      "external_tenant_id": "demo-tenant",
      "external_user_id": "demo-user",
      "status": "active",
      "created_at": "2026-05-25T12:00:00.000Z",
      "updated_at": "2026-05-25T12:00:00.000Z"
    }
  }
}
```

Save: `data.workspace.workspace_id`.

Common error:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Missing required permission: workspace:create.",
    "status": 403
  }
}
```

## Step 2: Create A Channel

What it does: creates a business context inside the workspace, such as finance, ops, or a Foretic forecast.

Permission: `channel:create`.

Request:

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

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "channel": {
      "id": "ch_demo",
      "channel_id": "ch_demo",
      "workspace_id": "ws_demo",
      "name": "Demo Channel",
      "channel_key": "ws_demo:demo_channel",
      "purpose": "Smoke test events",
      "status": "active"
    }
  }
}
```

Save: `data.channel.channel_id`.

## Step 3: Create A Connector

What it does: creates the signed webhook endpoint used to send events.

Permission: `connector:create`.

Request:

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

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "connector": {
      "id": "conn_demo",
      "connector_id": "conn_demo",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "connector_type": "webhook",
      "connector_key": "ck_demo",
      "connector_secret": "hu_sec_example_secret_returned_once",
      "status": "active",
      "enabled": 1
    }
  }
}
```

Save:

```text
data.connector.connector_key
data.connector.connector_secret
```

Important: `connector_secret` is returned once. Store it in Foretic or your secret manager. Do not commit it.

The connector can be used immediately after creation because admin provisioning writes both D1 metadata and the KV lookup used by event ingest.

## Step 4: Create A Signal

What it does: defines the metric/event stream to aggregate and watch.

Permission: `signal:create`.

Request:

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

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "signal": {
      "id": "sig_demo",
      "signal_id": "sig_demo",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "signal_key": "demo.metric",
      "signal_type": "metric",
      "value_mode": "last",
      "status": "active"
    },
    "signal_contract": {
      "default_bucket_types": ["minute", "hour"],
      "dimensions": ["source"]
    },
    "materialized_watches": []
  }
}
```

Save: `data.signal.signal_id`.

Create a channel contract when you want channel-level defaults and template watches:

```json
{
  "action": "admin.createChannelContract",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "purpose": "Forecast attention monitoring",
    "expected_signal_types": ["forecast_state"],
    "default_dimensions": ["forecast_id", "status"],
    "default_watch_templates": [
      {
        "name": "Pace below warning",
        "watch_type": "LAST_VALUE_LT",
        "config": {
          "threshold": 85,
          "severity": "warning"
        },
        "cooldown_seconds": 86400
      }
    ],
    "cta_policy": {
      "required": true,
      "kind": "review"
    }
  }
}
```

## Step 5: Create A Watch

What it does: defines when Heads Up should alert or stay quiet.

Permission: `watch:create`.

Request:

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

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "watch": {
      "id": "watch_demo",
      "watch_id": "watch_demo",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "signal_id": "sig_demo",
      "name": "Demo metric high",
      "watch_type": "LAST_VALUE_GT",
      "config_json": "{\"threshold\":10,\"severity\":\"warning\",\"bucket_type\":\"minute\"}",
      "cooldown_seconds": 3600,
      "enabled": 1
    }
  }
}
```

Save: `data.watch.watch_id`.

Weekly spend watch:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "signal_id": "sig_spend",
    "name": "OpenAI spend over weekly budget",
    "watch_type": "WINDOW_SUM_GT",
    "config": {
      "threshold": 500,
      "severity": "warning",
      "bucket_type": "week",
      "window": {
        "size": 1
      }
    },
    "cooldown_seconds": 86400
  }
}
```

Spike watch:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "signal_id": "sig_api_usage",
    "name": "API usage doubled",
    "watch_type": "PREVIOUS_PERIOD_RATIO_GT",
    "config": {
      "threshold": 2,
      "severity": "warning",
      "bucket_type": "hour"
    },
    "cooldown_seconds": 3600
  }
}
```

Renewal reminder:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "signal_id": "sig_renewals",
    "name": "OpenAI renewal due",
    "watch_type": "REMINDER_DUE",
    "config": {
      "due_at": "2026-06-01T00:00:00.000Z",
      "lead": {
        "unit": "day",
        "count": 7
      },
      "severity": "warning",
      "label": "OpenAI renewal"
    },
    "cooldown_seconds": 86400
  }
}
```

Recurring payment expectation with an amount range:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "signal_id": "sig_payment",
    "name": "Expected recurring payment",
    "watch_type": "MISSING_EXPECTED",
    "config": {
      "bucket_type": "day",
      "due_window": {
        "start_at": "2026-05-24T00:00:00.000Z",
        "end_at": "2026-05-24T23:59:59.000Z"
      },
      "minimum_count": 1,
      "value_range": {
        "field": "sum",
        "min": 100,
        "max": 200
      },
      "severity": "warning"
    },
    "cooldown_seconds": 86400
  }
}
```

## Step 6: Create A Subscriber

What it does: tells Heads Up where to send alerts or aggregate-forward payloads.

Permission: `subscriber:create`.

Request:

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

Response:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "subscriber": {
      "id": "sub_demo",
      "subscriber_id": "sub_demo",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "subscriber_type": "slack_webhook",
      "destination_url_redacted": "https://hooks.slack.com/services/T_TEST/...",
      "mode": "alert",
      "enabled": 1
    }
  }
}
```

Save: `data.subscriber.subscriber_id`.

Do not commit real Slack webhook URLs.

Create a quiet summary subscriber when you want scheduled proof-of-silence messages:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "subscriber_type": "webhook",
    "destination_url": "https://example.com/heads-up/quiet",
    "mode": "quiet_summary",
    "config": {
      "schedule": "hourly"
    }
  }
}
```

## Step 7: Sign And Send An Event

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

Request payload:

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

Response `202`:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_demo"
}
```

Common error:

```json
{
  "accepted": false,
  "error": {
    "code": "INVALID_HMAC_SIGNATURE",
    "message": "X-HeadsUp-Signature is invalid."
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
curl -H "Authorization: Bearer <operator token>" https://headsupp_app.martin-598.workers.dev/api/v1/observability/overview
```

This returns operational counts for active watches, aggregate rows, alerts, and delivery states. It does not return raw event payloads or subscriber secrets.

## Read Alerts And Quiet State

```json
{
  "action": "admin.getWatchState",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "watch_id": "watch_..."
  }
}
```

```json
{
  "action": "admin.listChannelAlerts",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "limit": 25
  }
}
```

These reads return safe alert and watch-state metadata. They do not return webhook destinations, connector secrets, or raw event bodies.

## Control Attention

Snooze a watch:

```json
{
  "action": "admin.snoozeWatch",
  "payload": {
    "workspace_id": "ws_...",
    "channel_id": "ch_...",
    "watch_id": "watch_...",
    "snooze_until": "2026-05-24T12:00:00.000Z",
    "reason": "Maintenance window"
  }
}
```

Mute/resume use `admin.muteWatch` and `admin.resumeWatch`. Ignore an alert with `admin.ignoreAlert`.

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
