# Heads Up API Quickstart

This guide creates a complete working integration:

```text
API key -> workspace -> channel -> subscriber -> connector -> signal -> watch -> signed event -> alert callback
```

Use the SDK guide (`node-cloudflare-client.md`) if you prefer JavaScript instead of raw HTTP. Use `getting-started-api-keys.md` if you only need first-run key setup.

## 0. Set Environment Values

```bash
HEADSUPP_BASE_URL=https://headsupp_app.martin-598.workers.dev
HEADSUPP_BOOTSTRAP_TOKEN=<operator bootstrap token>
HEADSUPP_API_KEY=<service api key after bootstrap>
```

For Slack alerts:

```bash
HEADSUPP_SLACK_WEBHOOK_URL=<Slack incoming webhook URL>
```

For generic callback alerts:

```bash
HEADSUPP_CALLBACK_URL=https://example.com/headsupp/alerts
```

Do not commit these values.

## 1. Get A Service API Key

If you already have `HEADSUPP_API_KEY`, skip this step.

Request:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "X-HeadsUp-Bootstrap-Token: $HEADSUPP_BOOTSTRAP_TOKEN" \
  -d '{
    "action": "operator.bootstrapServiceApiKey",
    "payload": {
      "name": "Demo integration service",
      "user_id": "service:demo",
      "source_app": "headsupp-demo",
      "permissions": [
        "workspace:create",
        "channel:create",
        "connector:create",
        "subscriber:create",
        "signal:create",
        "watch:create",
        "channel_contract:create",
        "channel_contract:update",
        "channel_contract:read",
        "alert:read",
        "watch:read",
        "watch:control"
      ]
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "api_key": "hu_api_returned_once",
    "key": {
      "key_id": "key_123",
      "status": "active"
    }
  }
}
```

Save `data.api_key` as `HEADSUPP_API_KEY`. It is shown once.

## 2. Create A Workspace

The workspace is the top-level tenant container.

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createWorkspace",
    "payload": {
      "name": "Demo Workspace",
      "source_app": "headsupp-demo",
      "external_tenant_id": "demo-tenant",
      "external_user_id": "demo-user"
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "workspace": {
      "workspace_id": "ws_demo",
      "name": "Demo Workspace",
      "status": "active"
    }
  }
}
```

Save `data.workspace.workspace_id`.

## 3. Create A Channel

A channel is a business context, such as finance, renewals, operations, or one customer forecast.

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createChannel",
    "payload": {
      "workspace_id": "ws_demo",
      "name": "Demo Metrics",
      "purpose": "Attention-worthy metric changes"
    }
  }'
```

Save `data.channel.channel_id`.

## 4. Subscribe Slack Or A Webhook

Subscribers receive output when watches create alerts or aggregate-forward deliveries.

### Slack Alert Subscriber

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createSubscriber",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "subscriber_type": "slack_webhook",
      "destination_url": "https://hooks.slack.com/services/T_TEST/B_TEST/SECRET",
      "display_name": "#ops-alerts",
      "mode": "alert"
    }
  }'
```

### Generic Alert Callback Subscriber

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createSubscriber",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "subscriber_type": "webhook",
      "destination_url": "https://example.com/headsupp/alerts",
      "display_name": "Demo alert callback",
      "mode": "alert",
      "config": {
        "signing_secret": "receiver_shared_secret"
      }
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "subscriber": {
      "subscriber_id": "sub_demo",
      "subscriber_type": "webhook",
      "mode": "alert",
      "destination_url_redacted": "https://example.com/..."
    }
  }
}
```

When a watch fires, all enabled `mode: "alert"` subscribers on the channel receive an alert delivery.

## 5. Create A Connector

The connector gives event producers a `connector_key` and one-time `connector_secret`.

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createConnector",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "connector_type": "webhook"
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "connector": {
      "connector_id": "conn_demo",
      "connector_key": "ck_demo",
      "connector_secret": "hu_sec_returned_once"
    }
  }
}
```

Save `connector_key` and `connector_secret`. The secret signs future events and is returned once.

## 6. Create A Signal

The signal tells Heads Up what metric or state you are sending.

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createSignal",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "signal_key": "demo.metric",
      "signal_type": "metric",
      "value_mode": "last",
      "contract": {
        "default_bucket_types": ["minute", "hour", "day", "week"],
        "dimensions": ["source"]
      }
    }
  }'
```

Save `data.signal.signal_id`.

## 7. Create A Watch

This watch alerts when the latest value is greater than 10.

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
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
      "cooldown_seconds": 3600,
      "recovery": {
        "enabled": true,
        "condition": "value <= 10",
        "severity": "recovery"
      }
    }
  }'
```

Save `data.watch.watch_id`.

More examples are in `watch-types.md`.

## 8. Send A Signed Event

Event ingest is not authenticated with the service API key. It uses connector HMAC.

Node signing example:

```js
import crypto from 'node:crypto';

const body = JSON.stringify({
  idempotency_key: 'evt_demo_001',
  signal_key: 'demo.metric',
  occurred_at: new Date().toISOString(),
  value: { num: 15 },
  fields: { source: 'demo' },
  cta: {
    label: 'View metric',
    url: 'https://example.com/metrics/demo',
  },
});

const timestamp = new Date().toISOString();
const signature = crypto
  .createHmac('sha256', process.env.HEADSUPP_CONNECTOR_SECRET)
  .update(`${timestamp}.${body}`)
  .digest('hex');

const response = await fetch(`${process.env.HEADSUPP_BASE_URL}/v1/events/${process.env.HEADSUPP_CONNECTOR_KEY}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-HeadsUp-Timestamp': timestamp,
    'X-HeadsUp-Signature': `sha256=${signature}`,
  },
  body,
});

console.log(await response.json());
```

Expected ingest response:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_demo"
}
```

The response means the event was accepted and queued. Aggregation, watch evaluation, and delivery happen asynchronously.

## 9. Receive The Alert Callback

If you subscribed Slack, Slack receives text similar to:

```text
Demo metric high is warning at 15. View metric: https://example.com/metrics/demo
```

If you subscribed a generic webhook, your receiver gets:

```json
{
  "type": "heads_up.alert",
  "alert_id": "alert_123",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "severity": "warning",
  "summary": "Demo metric high is warning at 15.",
  "fields": {
    "source": "demo"
  },
  "cta": {
    "label": "View metric",
    "url": "https://example.com/metrics/demo"
  }
}
```

Return a `2xx` response after storing or safely ignoring the payload. `429`, `5xx`, and network errors are retried.

If outbound signing is configured, verify:

```text
X-HeadsUp-Timestamp
X-HeadsUp-Signature
X-HeadsUp-Delivery-Id
```

See `webhook-receivers.md` for receiver code and retry rules.

## 10. Read Back Alerts And Watch State

List recent alerts:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.listChannelAlerts",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "limit": 10
    }
  }'
```

Get watch state:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.getWatchState",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "watch_id": "watch_demo"
    }
  }'
```

## Common Watch Examples

Total weekly spend greater than 500:

```json
{
  "watch_type": "WINDOW_SUM_GT",
  "config": {
    "threshold": 500,
    "severity": "warning",
    "bucket_type": "week",
    "window": { "size": 1 }
  }
}
```

Average latency over 3 minutes greater than 250:

```json
{
  "watch_type": "WINDOW_AVG_GT",
  "config": {
    "threshold": 250,
    "severity": "warning",
    "bucket_type": "minute",
    "window": { "size": 3 }
  }
}
```

Usage doubled compared with the previous hour:

```json
{
  "watch_type": "PREVIOUS_PERIOD_RATIO_GT",
  "config": {
    "threshold": 2,
    "severity": "warning",
    "bucket_type": "hour"
  }
}
```

No event arrived in 3 hours:

```json
{
  "watch_type": "MISSING_EXPECTED",
  "config": {
    "expected_every": { "unit": "hour", "count": 3 },
    "minimum_count": 1,
    "grace_seconds": 900,
    "bucket_type": "hour",
    "severity": "warning"
  }
}
```

Renewal due in 7 days:

```json
{
  "watch_type": "REMINDER_DUE",
  "config": {
    "due_at": "2026-06-01T00:00:00.000Z",
    "lead": { "unit": "day", "count": 7 },
    "severity": "warning",
    "label": "OpenAI renewal",
    "cta": {
      "label": "Review renewal",
      "url": "https://example.com/renewals/openai"
    }
  }
}
```

See `watch-types.md` for the full feature catalog.

## What To Read Next

```text
getting-started-api-keys.md  first-run key setup
webhook-receivers.md         Slack and generic callback handling
watch-types.md               choose the right feature/watch
node-cloudflare-client.md    same flow through the SDK
reference.md                 full endpoint/action reference
```
