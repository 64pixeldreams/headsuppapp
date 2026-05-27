# Client Reference

SDK-first reference for `@64pixeldreams/headsupp-client`. Every example uses `createHeadsUpClient`; payloads are the `payload` argument to each method.

```js
import { createHeadsUpClient, HeadsUpApiError } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});
```

## createHeadsUpClient(options)

| Option | Required | Description |
|--------|----------|-------------|
| `baseUrl` | yes | API root, no trailing slash |
| `apiKey` | usually | Bearer token for `/api/function` |
| `bootstrapToken` | first key only | `X-HeadsUp-Bootstrap-Token` header |
| `fetch` | no | Custom fetch (Cloudflare Workers: pass `fetch`) |

## bootstrapServiceApiKey(payload)

First service key only. Returns `{ api_key, ... }` (key shown once).

```js
const operator = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  bootstrapToken: process.env.HEADSUPP_BOOTSTRAP_TOKEN,
});

const { api_key } = await operator.bootstrapServiceApiKey({
  name: 'My integration',
  user_id: 'service:my-app',
  source_app: 'my-app',
  permissions: ['workspace:create', 'channel:create', 'connector:create', 'signal:create', 'watch:create', 'subscriber:create', 'subscriber:update', 'subscriber:delete', 'alert:read', 'watch:read', 'watch:control'],
});
```

## Workspace and channel

### createWorkspace(payload) → workspace

```js
const workspace = await headsup.createWorkspace({
  name: 'Acme Ops',
  source_app: 'acme-dashboard',
  external_tenant_id: 'tenant_1',
});
// workspace.workspace_id
```

### createChannel(payload) → channel

```js
const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'Production metrics',
  purpose: 'SLO and spend alerts',
  metadata: { team: 'platform' },
});
// channel.channel_id
```

### getChannel(payload) → channel

```js
const channel = await headsup.getChannel({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});
```

### updateChannel(payload) → channel

```js
await headsup.updateChannel({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  metadata: { team: 'platform', env: 'prod' },
});
```

## Channel contracts

### createChannelContract(payload) → channel_contract

### updateChannelContract(payload) → channel_contract

See [cookbook/channel-contracts.md](cookbook/channel-contracts.md).

## Ingest

### createConnector(payload) → connector

```js
const connector = await headsup.createConnector({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  connector_type: 'webhook',
});
// connector.connector_key, connector.connector_secret (secret once)
```

### createSignal(payload) → { signal, ... }

```js
const signalResult = await headsup.createSignal({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_key: 'orders.count',
  signal_type: 'metric',
  value_mode: 'last',
  contract: { default_bucket_types: ['minute', 'hour', 'day'] },
});
// signalResult.signal.signal_id
```

### sendEvent({ connectorKey, connectorSecret, event, timestamp? })

Signs and posts one event. Returns ingest envelope (`accepted`, `queued`, ...).

```js
const result = await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: 'evt_001',
    signal_key: 'orders.count',
    occurred_at: new Date().toISOString(),
    value: { num: 100 },
    fields: { region: 'eu' },
  },
});
```

Event shape:

```json
{
  "idempotency_key": "string (required)",
  "signal_key": "string (required)",
  "occurred_at": "ISO-8601 (required)",
  "value": { "num": 0 },
  "fields": {},
  "cta": { "label": "Open", "url": "https://..." }
}
```

### sendEvents({ connectorKey, connectorSecret, events, timestamp? })

Batch ingest; body is `{ events: [...] }`.

### signEventPayload({ connectorSecret, timestamp, rawBody })

Low-level HMAC helper if you build custom transports.

## Subscribers

### createSubscriber(payload) → subscriber

```js
const sub = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/alerts',
  display_name: 'Ops webhook',
  mode: 'alert',
  config: { signing_secret: 'shared_secret' },
});
```

`subscriber_type`: `webhook`, `slack_webhook`, `email`, ...

`mode`: `alert`, `aggregate_forward`, `quiet_summary`, or `lifecycle`.

Use `mode: 'lifecycle'` with `subscriber_type: 'webhook'` to receive opt-in/opt-out callbacks. See [webhook-receivers.md](../api/webhook-receivers.md).

### getSubscriber(payload) → subscriber

Refresh subscriber state after email confirmation:

```js
const sub = await headsup.getSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: 'sub_123',
});
// sub.config.authorization.status === 'authorized'
```

Lookup by email when needed:

```js
await headsup.getSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  email: 'user@example.com',
  mode: 'alert',
});
```

### listSubscribers(payload) → subscribers[]

```js
const subs = await headsup.listSubscribers({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});
```

### disableSubscriber(payload) → subscriber

By id or email:

```js
await headsup.disableSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: sub.subscriber_id,
});
```

### disableSubscriberByEmail(payload) → subscriber

Convenience wrapper; same API action as disable with `email` lookup.

```js
await headsup.disableSubscriberByEmail({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  email: 'user@example.com',
  mode: 'alert',
});
```

### deleteSubscriber(payload) → subscriber

Same lookup fields as disable.

## Watches

### createWatch(payload) → watch

```js
const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'High orders',
  watch_type: 'LAST_VALUE_GT',
  config: {
    threshold: 1000,
    severity: 'warning',
    bucket_type: 'minute',
  },
  cooldown_seconds: 3600,
  recovery: {
    enabled: true,
    condition: 'value <= 900',
    severity: 'recovery',
  },
});
```

Watch types and config: [concepts/watch-types.md](concepts/watch-types.md).

## Read models

### listChannelAlerts(payload) → { alerts, metadata }

```js
const { alerts, metadata } = await headsup.listChannelAlerts({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 20,
});
```

### getWatchState(payload) → watch_state | null

```js
const state = await headsup.getWatchState({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
```

## Watch action controls

### snoozeWatch(payload) → action_control

```js
await headsup.snoozeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
  snooze_until: new Date(Date.now() + 3600000).toISOString(),
  reason: 'Maintenance',
});
```

### muteWatch(payload) → action_control

### resumeWatch(payload) → action_control

### ignoreAlert(payload) → action_control

```js
await headsup.ignoreAlert({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  alert_id: 'alert_123',
});
```

See [cookbook/noise-control.md](cookbook/noise-control.md).

## requestFunction(action, payload, options?)

Escape hatch for actions without a named wrapper:

```js
const timeline = await headsup.requestFunction('admin.listAlertTimeline', {
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 50,
});

const contract = await headsup.requestFunction('admin.getChannelContract', {
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});
```

Registered admin actions include: `admin.getChannelContract`, `admin.listChannelContractVersions`, `admin.listAlertTimeline`, and all actions covered by named methods above.

## Errors

```js
import { HeadsUpApiError } from '@64pixeldreams/headsupp-client';

try {
  await headsup.createWorkspace({ name: 'Demo' });
} catch (error) {
  if (error instanceof HeadsUpApiError) {
    console.error(error.code, error.status, error.message, error.response);
  }
  throw error;
}
```

## Cloudflare Workers

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

export default {
  async fetch(_request, env) {
    const headsup = createHeadsUpClient({
      baseUrl: env.HEADSUPP_BASE_URL,
      apiKey: env.HEADSUPP_API_KEY,
      fetch,
    });
    await headsup.sendEvent({
      connectorKey: env.HEADSUPP_CONNECTOR_KEY,
      connectorSecret: env.HEADSUPP_CONNECTOR_SECRET,
      event: {
        idempotency_key: crypto.randomUUID(),
        signal_key: 'worker.heartbeat',
        occurred_at: new Date().toISOString(),
        value: { num: 1 },
      },
    });
    return new Response('ok');
  },
};
```

## Cookbooks

| Feature | Doc |
|---------|-----|
| Webhook alerts | [cookbook/webhook-alerts.md](cookbook/webhook-alerts.md) |
| Email alerts | [cookbook/email-alerts.md](cookbook/email-alerts.md) |
| Aggregate forward | [cookbook/aggregate-forwarding.md](cookbook/aggregate-forwarding.md) |
| Trend watches | [cookbook/trend-watches.md](cookbook/trend-watches.md) |
| Noise control | [cookbook/noise-control.md](cookbook/noise-control.md) |
| Subscriber lifecycle | [cookbook/subscriber-lifecycle.md](cookbook/subscriber-lifecycle.md) |
