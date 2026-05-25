# Heads Up Quickstart (1-2-3-4-5)

Start here for a full working integration.

This quickstart shows one complete path:

1. Create a service API key.
2. Create a channel with channel metadata.
3. Subscribe a webhook callback.
4. Create a coffee-spend watch.
5. Send an event and receive a callback.

If you need full action-by-action property definitions, use [reference.md](reference.md).

## Prerequisites

```bash
HEADSUPP_BASE_URL=https://headsupp_app.martin-598.workers.dev
HEADSUPP_BOOTSTRAP_TOKEN=<bootstrap token>
```

After step 1:

```bash
HEADSUPP_API_KEY=<service api key>
```

Do not commit these values.

## 1) Create A Service API Key

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "X-HeadsUp-Bootstrap-Token: $HEADSUPP_BOOTSTRAP_TOKEN" \
  -d '{
    "action": "operator.bootstrapServiceApiKey",
    "payload": {
      "name": "Demo integration service",
      "user_id": "service:integration",
      "source_app": "headsupp-demo",
      "permissions": [
        "workspace:create",
        "channel:create",
        "channel:read",
        "channel:update",
        "connector:create",
        "subscriber:create",
        "signal:create",
        "watch:create",
        "alert:read",
        "watch:read"
      ]
    }
  }'
```

Save `data.api_key` as `HEADSUPP_API_KEY`.

## 2) Create Workspace + Channel (With Metadata)

Create a workspace:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createWorkspace",
    "payload": {
      "name": "Demo Workspace",
      "source_app": "headsupp-demo",
      "external_tenant_id": "tenant_demo",
      "external_user_id": "user_demo"
    }
  }'
```

Create a channel and attach metadata you want echoed in callbacks:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createChannel",
    "payload": {
      "workspace_id": "ws_demo",
      "name": "Coffee Spend",
      "purpose": "Spend anomaly monitoring",
      "metadata": {
        "user_id": "user_demo",
        "forecast_id": "forecast_coffee_2026",
        "budget_id": "budget_coffee_primary"
      }
    }
  }'
```

Save `workspace_id` and `channel_id`.

## 3) Subscribe An Alert Webhook

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
      "destination_url": "https://example.com/headsup-alerts",
      "display_name": "Demo alert receiver",
      "mode": "alert",
      "config": {
        "signing_secret": "receiver_shared_secret"
      }
    }
  }'
```

## 4) Create Connector + Signal + Coffee Watch

Create connector:

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

Create signal:

```bash
curl -X POST "$HEADSUPP_BASE_URL/api/function" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HEADSUPP_API_KEY" \
  -d '{
    "action": "admin.createSignal",
    "payload": {
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "signal_key": "spend.coffee.usd",
      "signal_type": "metric",
      "value_mode": "last"
    }
  }'
```

Create watch (weekly total coffee spend > 50):

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
      "name": "Coffee weekly spend high",
      "watch_type": "WINDOW_SUM_GT",
      "config": {
        "threshold": 50,
        "severity": "warning",
        "bucket_type": "week",
        "window": { "size": 1 }
      }
    }
  }'
```

Save `connector_key` and `connector_secret` from the connector response (secret is shown once).

## 5) Send Event, Then Receive Callback

Send an event (Node example for HMAC signing):

```js
import crypto from 'node:crypto';

const payload = {
  idempotency_key: `coffee_${Date.now()}`,
  signal_key: 'spend.coffee.usd',
  occurred_at: new Date().toISOString(),
  value: { num: 56.75 },
  fields: { vendor: 'local_shop', currency: 'USD' },
  cta: { label: 'Open coffee ledger', url: 'https://example.com/coffee' },
};

const rawBody = JSON.stringify(payload);
const timestamp = new Date().toISOString();
const signature = crypto
  .createHmac('sha256', process.env.HEADSUPP_CONNECTOR_SECRET)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');

const response = await fetch(
  `${process.env.HEADSUPP_BASE_URL}/v1/events/${process.env.HEADSUPP_CONNECTOR_KEY}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HeadsUp-Timestamp': timestamp,
      'X-HeadsUp-Signature': `sha256=${signature}`,
    },
    body: rawBody,
  },
);

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

When the watch fires, your webhook gets:

```json
{
  "type": "heads_up.alert",
  "alert_id": "alert_123",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "signal_id": "sig_demo",
  "watch_id": "watch_demo",
  "severity": "warning",
  "summary": "Coffee weekly spend high is warning at 56.75.",
  "current_value": 56.75,
  "threshold_value": 50,
  "triggered_at": "2026-05-25T18:00:00.000Z",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026",
    "budget_id": "budget_coffee_primary"
  },
  "fields": {
    "vendor": "local_shop",
    "currency": "USD"
  },
  "cta": {
    "label": "Open coffee ledger",
    "url": "https://example.com/coffee"
  }
}
```

Machine-routing keys are `type`, `watch_id`, `signal_id`, and `channel_metadata`.

## Optional: Update Channel Metadata Later

```json
{
  "action": "admin.updateChannel",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "metadata": {
      "user_id": "user_demo",
      "forecast_id": "forecast_coffee_2026_v2",
      "budget_id": "budget_coffee_primary"
    }
  }
}
```

## Next Docs

- [use-cases.md](use-cases.md) for practical pattern selection and value mapping.
- [reference.md](reference.md) for all request/response properties.
- [sdk-readme.md](sdk-readme.md) for the SDK flow.
- [webhook-receivers.md](webhook-receivers.md) for signature verification and retry behavior.
