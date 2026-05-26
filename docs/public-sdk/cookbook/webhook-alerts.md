# Cookbook: Webhook Alerts

Provision a webhook subscriber, threshold watch, send an event, and verify the callback.

## Provision

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

const workspace = await headsup.createWorkspace({ name: 'Webhook demo', source_app: 'cookbook' });
const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'Webhook channel',
});

await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: process.env.HEADSUPP_WEBHOOK_URL,
  display_name: 'Alert receiver',
  mode: 'alert',
  config: { signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET },
});

const connector = await headsup.createConnector({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  connector_type: 'webhook',
});

const signalResult = await headsup.createSignal({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_key: 'demo.metric',
  signal_type: 'metric',
  value_mode: 'last',
});

await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Demo metric high',
  watch_type: 'LAST_VALUE_GT',
  config: { threshold: 10, severity: 'warning', bucket_type: 'minute' },
});
```

## Send event

```js
await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: `webhook_demo_${Date.now()}`,
    signal_key: 'demo.metric',
    occurred_at: new Date().toISOString(),
    value: { num: 25 },
    cta: { label: 'View metric', url: 'https://example.com/metrics' },
  },
});
```

## Verify inbound callback

Your endpoint receives a signed POST. See [webhook-receivers.md](../webhook-receivers.md) for header verification (`X-HeadsUp-Signature`, `X-HeadsUp-Timestamp`).

Example delivery body (shape varies by alert):

```json
{
  "alert_id": "alert_...",
  "watch_id": "watch_...",
  "severity": "warning",
  "signal_key": "demo.metric",
  "current_value": 25,
  "threshold": 10,
  "channel_id": "ch_...",
  "workspace_id": "ws_..."
}
```

## What you should see

- Ingest: `{ "accepted": true, "queued": 1 }`
- Webhook: HTTP POST with HMAC headers when the watch triggers after aggregation
- `listChannelAlerts`: new row when alert is created
