# Heads Up API Reference

This is the current public API reference for `headsupp_app`. It is OpenAPI-style, but kept as Markdown so Cursor and engineers can read it quickly.

## Service

Base URLs:

```text
local: http://localhost:8787
deployed: https://headsupp_app.martin-598.workers.dev
```

Content type:

```text
application/json
```

All examples use fake IDs, fake domains, and placeholder secrets. Runtime-only values such as API keys, connector secrets, Cloudflare tokens, and Slack webhook URLs must stay outside the repo.

## Product Contract

Heads Up is an attention-processing API:

```text
connector -> channel -> signal -> aggregate -> watch -> alert or aggregate forward
```

Important behavior:

```text
ingest authenticates, validates, queues, and returns 202
raw events update aggregates asynchronously
watches evaluate aggregate rows, not raw events
subscribers receive alerts or aggregate outputs only when a watch path requires it
```

## Authentication

Control-plane functions use CFKit auth:

```text
Authorization: Bearer <api_key>
```

Event ingest uses connector HMAC:

```text
X-HeadsUp-Timestamp: <ISO timestamp>
X-HeadsUp-Signature: sha256=<hmac>
```

HMAC message:

```text
<timestamp>.<raw JSON body>
```

## GET /health

Purpose: lightweight health check.

Authentication: none.

Response `200`:

```json
{
  "status": "ok",
  "app": "headsupp_app",
  "framework": "CFKit",
  "role": "attention-processing-api",
  "timestamp": "2026-05-24T18:00:00.000Z"
}
```

## GET /api/v1/health

Purpose: versioned health check.

Authentication: none.

Response shape matches `GET /health`.

## GET /api/v1/observability/overview

Purpose: read-only operational counts for verification. This is not a dashboard API and must not return secrets, raw event bodies, or subscriber payload bodies.

Authentication: currently none.

Response `200`:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "active_watches": 2,
    "aggregate_rows": 99,
    "deliveries": {
      "alerts": {
        "pending": 1,
        "retrying": 0,
        "failed": 0
      },
      "aggregates": {
        "pending": 0,
        "retrying": 0,
        "failed": 0
      }
    },
    "operator_health": {
      "retry_backlog": {
        "alerts_due": 0,
        "aggregates_due": 0
      },
      "old_pending": {
        "alerts": 0,
        "aggregates": 0
      },
      "scheduled_tasks": {
        "status": "ok",
        "last_success_at": "2026-05-24T18:00:00.000Z",
        "last_failure_at": null,
        "last_error_code": null,
        "last_error_message": null,
        "updated_at": "2026-05-24T18:00:00.000Z"
      }
    }
  }
}
```

Error `501`:

```json
{
  "success": false,
  "error": {
    "code": "DB_NOT_CONFIGURED",
    "message": "DB binding is required for observability."
  }
}
```

## POST /api/function

Purpose: CFKit control-plane and helper actions.

Authentication: action-dependent. Admin and auth context actions require a Bearer API key. Health/version actions do not.

Request:

```json
{
  "action": "admin.createWorkspace",
  "payload": {}
}
```

Error `400` when action is missing:

```json
{
  "success": false,
  "error": {
    "code": "MISSING_ACTION",
    "message": "Action is required"
  }
}
```

### Public Helper Actions

```text
headsupp.health
headsupp.version
headsupp.authContext
```

`headsupp.authContext` returns a sanitized auth summary and must never expose API keys.

### Operator Actions

```text
operator.bootstrapServiceApiKey
operator.listServiceApiKeys
operator.revokeServiceApiKey
operator.rotateServiceApiKey
operator.listAuditLogs
```

Bootstrap request:

```json
{
  "action": "operator.bootstrapServiceApiKey",
  "payload": {
    "name": "Heads Up provisioning service",
    "user_id": "service:headsupp-operator",
    "permissions": ["workspace:create", "channel:create", "connector:create"]
  }
}
```

Header:

```text
X-HeadsUp-Bootstrap-Token: <runtime bootstrap token>
```

Creation and rotation return the raw `api_key` once. List and revoke actions return safe metadata only.

### Admin Actions

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

### Create Workspace

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

### Create Channel

Request:

```json
{
  "action": "admin.createChannel",
  "payload": {
    "workspace_id": "ws_demo",
    "name": "Demo Channel",
    "purpose": "Smoke test events"
  }
}
```

### Create Connector

Request:

```json
{
  "action": "admin.createConnector",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "connector_type": "webhook"
  }
}
```

Response includes `connector_key` and a one-time `connector_secret`. Store the secret outside the repo.

### Create Signal

Request:

```json
{
  "action": "admin.createSignal",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
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

### Create Watch

Request:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "signal_id": "sig_demo",
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

Supported watch families in the current API:

```text
LAST_VALUE_GT
LAST_VALUE_LT
WINDOW_AVG_GT
WINDOW_SUM_GT
WINDOW_COUNT_GT
MISSING_EXPECTED
DIGEST
AGGREGATE_FORWARD
```

Scheduled watches run from Cloudflare Cron, not inline ingest.

### Create Subscriber

Slack alert subscriber:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "slack_webhook",
    "destination_url": "https://hooks.slack.com/services/T_TEST/B_TEST/SECRET",
    "display_name": "#demo-alerts",
    "mode": "alert"
  }
}
```

Generic webhook subscriber:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "webhook",
    "destination_url": "https://example.com/heads-up/callback",
    "display_name": "Demo callback",
    "mode": "aggregate_forward"
  }
}
```

Rules:

```text
destination_url must be https
slack_webhook destinations must be Slack incoming webhook URLs
mode must be alert or aggregate_forward
responses return destination_url_redacted, not full destination_url
```

## POST /v1/events/{connector_key}

Purpose: event ingest.

Authentication: connector HMAC.

Asynchronous behavior: a successful response means raw messages were queued. Aggregates, watch decisions, alerts, and deliveries happen after queue processing.

Single event request:

```json
{
  "idempotency_key": "evt_demo_001",
  "signal_key": "demo.metric",
  "occurred_at": "2026-05-24T18:00:00.000Z",
  "value": {
    "num": 15
  },
  "fields": {
    "source": "demo"
  },
  "cta": {
    "label": "View",
    "url": "https://example.com/demo",
    "kind": "review"
  }
}
```

Batch request:

```json
{
  "events": [
    {
      "idempotency_key": "evt_demo_001",
      "signal_key": "demo.metric",
      "occurred_at": "2026-05-24T18:00:00.000Z",
      "value": {
        "num": 5
      },
      "fields": {
        "source": "demo"
      }
    }
  ]
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

Common ingest errors:

```text
400 INVALID_JSON
400 INVALID_EVENT_PAYLOAD
401 MISSING_CONNECTOR
401 MISSING_SIGNATURE
401 INVALID_SIGNATURE
401 STALE_TIMESTAMP
405 METHOD_NOT_ALLOWED
501 INGEST_STORE_NOT_CONFIGURED
501 RAW_EVENTS_QUEUE_NOT_CONFIGURED
```

The exact validation code is returned in `error.code`.

## Control-Plane Errors

Common admin/operator errors:

```text
BOOTSTRAP_AUTH_REQUIRED
AUTH_REQUIRED
PERMISSION_DENIED
TENANT_SCOPE_MISMATCH
WORKSPACE_CHANNEL_MISMATCH
SIGNAL_SCOPE_MISMATCH
MISSING_KEY_ID
API_KEY_NOT_FOUND
DB_NOT_CONFIGURED
```

Admin resource creation writes safe audit rows. Audit metadata redacts raw keys, connector secrets, tokens, and destination URLs.

## Subscriber Payloads

Slack alert payload:

```json
{
  "text": "Demo metric high is warning at 15. View: https://example.com/demo"
}
```

Generic alert webhook payload:

```json
{
  "type": "heads_up.alert",
  "alert_id": "alert_demo",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "signal_id": "sig_demo",
  "watch_id": "watch_demo",
  "severity": "warning",
  "summary": "Demo metric high is warning at 15.",
  "current_value": 15,
  "threshold_value": 10,
  "triggered_at": "2026-05-24T18:00:00.000Z",
  "cta": {
    "label": "View",
    "url": "https://example.com/demo"
  }
}
```

Aggregate-forward webhook payload:

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "delivery_id": "aggdel_demo",
  "dedupe_key": "sub_demo:sig_demo:hour:2026-05-24T17:00:00.000Z",
  "signal_key": "demo.metric",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-24T17:00:00.000Z",
    "end_at": "2026-05-24T18:00:00.000Z"
  },
  "values": {
    "sum": 42,
    "count": 3,
    "avg": 14,
    "min": 10,
    "max": 17,
    "last": 15
  }
}
```

Delivery status rules:

```text
2xx => sent
429, 5xx, network error => retrying
400, 401, 403, 404 => failed
```

## Tenant Boundaries

All control-plane resources should preserve:

```text
source_app
external_tenant_id
external_user_id
workspace_id
```

Ingest ownership is resolved from the connector, not from event body fields.

## Verification Commands

Local:

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
```

Deployed proof suite:

```bash
cd apps/headsupp-api
npm run smoke:generic-slack
npm run smoke:alert-decisions
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
```

See `docs/api/smoke-test-suite.md` for required runtime environment variables and pass/fail signals.
