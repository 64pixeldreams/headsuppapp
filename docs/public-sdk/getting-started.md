# Getting Started (SDK)

Use `@64pixeldreams/headsupp-client` end-to-end: provision a channel, subscribe a webhook, create a watch, send an event, and read alert state.

Prerequisites:

- Heads Up API base URL and service API key (or bootstrap token for first key)
- Node.js 20+

## Install

```bash
npm install @64pixeldreams/headsupp-client@0.1.1
```

## Environment

```bash
export HEADSUPP_BASE_URL=https://api.headsupp.io
export HEADSUPP_API_KEY=hu_api_...
export HEADSUPP_CONNECTOR_KEY=ck_...      # after setup
export HEADSUPP_CONNECTOR_SECRET=hu_sec_... # shown once at connector create
```

Optional (first key only):

```bash
export HEADSUPP_BOOTSTRAP_TOKEN=...
```

Webhook receiver signing (your app verifies inbound Heads Up POSTs; **you generate this secret** — Heads Up does not issue it):

```bash
export HEADSUPP_RECEIVER_SIGNING_SECRET=...   # same value as config.signing_secret on createSubscriber
```

See [webhook-receivers.md](../api/webhook-receivers.md#receiver-signing-secret-setup) for generate → deploy → subscriber setup.

## 1) Create client

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});
```

## 2) Workspace and channel

For production third-party apps, prefer `provisionChannel()` because it creates or reuses the full setup in one idempotent request. The step-by-step calls below remain useful for learning and debugging.

```js
const setup = await headsup.provisionChannel({
  workspace: {
    workspace_key: 'coffee:demo-tenant',
    name: 'Coffee Demo',
    source_app: 'headsupp-demo',
    external_tenant_id: 'demo-tenant',
    external_user_id: 'demo-user'
  },
  channel: {
    channel_key: 'coffee:demo-tenant:spend',
    name: 'Coffee spend',
    purpose: 'Demo coffee alerts'
  },
  connector: {
    connector_key: 'ck_coffee_demo_tenant_spend'
  },
  signals: [{ signal_key: 'spend.coffee.usd' }],
  watches: [
    {
      signal_key: 'spend.coffee.usd',
      watch_key: 'coffee_budget_high',
      name: 'Coffee budget high',
      watch_type: 'LAST_VALUE_GT',
      config: { threshold: 50, severity: 'warning' }
    }
  ]
});

const { workspace, channel, connector } = setup;
```

```js
const workspace = await headsup.createWorkspace({
  name: 'Coffee Demo',
  source_app: 'headsupp-demo',
  external_tenant_id: 'demo-tenant',
});

const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'Coffee spend',
  purpose: 'Demo coffee alerts',
});
```

Example response fields you need next:

```json
{
  "workspace_id": "ws_abc123",
  "name": "Coffee Demo"
}
```

```json
{
  "channel_id": "ch_def456",
  "workspace_id": "ws_abc123",
  "name": "Coffee spend"
}
```

## 3) Webhook subscriber

```js
const subscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/alerts',
  display_name: 'Demo alert receiver',
  mode: 'alert',
  config: {
    signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET || 'demo_receiver_secret',
  },
});
```

Save `subscriber.subscriber_id` if you attach watches to a specific subscriber later.

## 4) Connector, signal, watch

```js
const connector = await headsup.createConnector({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  connector_type: 'webhook',
});

const signalResult = await headsup.createSignal({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_key: 'spend.coffee.usd',
  signal_type: 'metric',
  value_mode: 'last',
  contract: {
    default_bucket_types: ['minute', 'hour', 'day', 'week'],
  },
});

const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Coffee weekly spend high',
  watch_type: 'WINDOW_SUM_GT',
  config: {
    threshold: 50,
    severity: 'warning',
    bucket_type: 'week',
    window: { size: 1 },
  },
  cooldown_seconds: 3600,
});
```

Save once (connector secret is shown only at create):

```text
connector.connector_key      -> HEADSUPP_CONNECTOR_KEY
connector.connector_secret   -> HEADSUPP_CONNECTOR_SECRET
signalResult.signal.signal_id
watch.watch_id
```

## 5) Send event

```js
const accepted = await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: `coffee_${Date.now()}`,
    signal_key: 'spend.coffee.usd',
    occurred_at: new Date().toISOString(),
    value: { num: 56.75 },
    fields: { vendor: 'local_shop', currency: 'USD' },
    cta: { label: 'Open coffee ledger', url: 'https://example.com/coffee', color_class: 'warning' },
  },
});

console.log({ queued: accepted.queued, accepted: accepted.accepted });
```

Example ingest response:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_..."
}
```

## 6) Read alerts and watch state

```js
const { alerts, metadata } = await headsup.listChannelAlerts({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 10,
});

const state = await headsup.getWatchState({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});

console.log({ alertCount: alerts.length, asOf: metadata?.as_of, lastStatus: state?.last_status });
```

## 7) Snooze and resume

```js
await headsup.snoozeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
  snooze_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  reason: 'Demo maintenance',
});

await headsup.resumeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
```

## Email path (optional)

Same flow; swap step 3 for an email subscriber. See [cookbook/email-alerts.md](cookbook/email-alerts.md).

## Runnable script

Save as `getting-started.mjs` and run with env vars set:

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

const workspace = await headsup.createWorkspace({
  name: `SDK demo ${Date.now()}`,
  source_app: 'headsupp-sdk-getting-started',
});

const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'SDK demo channel',
  purpose: 'Getting started script',
});

await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: process.env.HEADSUPP_WEBHOOK_URL || 'https://example.com/headsupp/alerts',
  display_name: 'SDK demo webhook',
  mode: 'alert',
  config: { signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET || 'demo_receiver_secret' },
});

const connector = await headsup.createConnector({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  connector_type: 'webhook',
});

const signalResult = await headsup.createSignal({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_key: 'sdk.demo.metric',
  signal_type: 'metric',
  value_mode: 'last',
});

const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'SDK demo high',
  watch_type: 'LAST_VALUE_GT',
  config: { threshold: 1, severity: 'warning', bucket_type: 'minute' },
});

const accepted = await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: `sdk_demo_${Date.now()}`,
    signal_key: 'sdk.demo.metric',
    occurred_at: new Date().toISOString(),
    value: { num: 42 },
  },
});

const { alerts } = await headsup.listChannelAlerts({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 5,
});

console.log(
  JSON.stringify(
    {
      workspace_id: workspace.workspace_id,
      channel_id: channel.channel_id,
      connector_key: connector.connector_key,
      watch_id: watch.watch_id,
      queued: accepted.queued,
      alert_count: alerts.length,
    },
    null,
    2,
  ),
);
```

## Next steps

| Topic | Doc |
|-------|-----|
| All client methods | [client-reference.md](client-reference.md) |
| Webhook delivery verification | [webhook-receivers.md](webhook-receivers.md) |
| Email alerts | [cookbook/email-alerts.md](cookbook/email-alerts.md) |
| Watch type chooser | [concepts/watch-types.md](concepts/watch-types.md) |
| Raw HTTP / OpenAPI | [appendix/canonical-api-docs.md](appendix/canonical-api-docs.md) |
