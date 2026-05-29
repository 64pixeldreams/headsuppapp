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

### provisionChannel(payload) → setup

Creates or reuses a complete channel setup in one idempotent call: workspace, channel, connector, signals, watch groups, watches, channel subscribers, and workspace subscribers.

```js
const setup = await headsup.provisionChannel({
  workspace: {
    workspace_key: 'demo:tenant_1',
    name: 'Demo tenant 1',
    source_app: 'demo',
    external_tenant_id: 'tenant_1',
    external_user_id: 'user_1'
  },
  channel: {
    channel_key: 'demo:tenant_1:forecast:job_123',
    name: 'Forecast job 123'
  },
  connector: {
    connector_key: 'ck_demo_tenant_1_job_123'
  },
  signals: [{ signal_key: 'forecast.revenue.pace' }],
  watch_groups: [
    {
      signal_key: 'forecast.revenue.pace',
      group_key: 'forecast_pace_health',
      name: 'Forecast pace health',
      winner_policy: 'highest_severity_wins',
      cooldown_seconds: 3600,
      recovery: { condition: 'value >= 95', severity: 'recovery' },
      bands: [
        {
          band_key: 'warning',
          severity: 'warning',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 85, bucket_type: 'minute' }
        },
        {
          band_key: 'critical',
          severity: 'critical',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 70, bucket_type: 'minute' }
        }
      ]
    }
  ],
  subscribers: [
    {
      subscriber_key: 'demo:job_123:board@example.com',
      subscriber_type: 'email',
      destination_url: 'board@example.com',
      mode: 'alert',
      config: {
        template_id: 'forecast_alert_v1',
        authorization: { required: true },
        filters: {
          signal_keys: ['forecast.revenue.pace'],
          band_keys: ['warning', 'critical']
        }
      }
    }
  ],
  workspace_subscribers: [
    {
      subscriber_scope: 'workspace',
      subscriber_type: 'webhook',
      destination_url: 'https://example.com/heads-up/alerts',
      mode: 'alert'
    }
  ]
});

// setup.created / setup.reused explain what changed
// setup.updated.subscribers increments when provisionChannel changes subscriber preferences
// setup.connector.connector_secret is returned only when the connector is new
```

Use `watch_groups` for related bands such as warning and critical. With `highest_severity_wins`, a critical value sends only the critical alert; the warning band is suppressed for that evaluation. Keep `watches` for independent policies that should alert separately.

Use `EVENT_OCCURRENCE` in `watches` for one-shot business events such as `forecast.goal.reached` or `forecast.bucket.closed`. Configure `event_type` and `dedupe_key_path`; Heads Up persists the occurrence key and suppresses replays while allowing the next distinct occurrence to alert without recovery.

Use subscriber `config.filters` when each recipient chooses alert types. Supported filter fields are `signal_keys`, `watch_group_keys`, `watch_keys`, and `band_keys`. No filters means the subscriber receives all matching channel alerts. Rerun `provisionChannel` with the same `subscriber_key` to update filters idempotently.

For SaaS integrations, start with [cookbook/saas-integration.md](cookbook/saas-integration.md). It explains when to use one channel per resource versus one channel per alert board. Repeat provisioning with the same `subscriber_key` updates subscriber config such as filters without sending another opt-in email; changing an email destination should be treated as a new subscriber or reauthorization flow.

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
  "cta": {
    "label": "Open",
    "url": "https://...",
    "variant": "primary"
  }
}
```

Email CTA variants can be passed as `cta.variant` or `cta.color_class`. Supported values are `primary`, `success`, `warning`, `danger`, `info`, `dark`, and `light`; invalid values fall back to `dark`. Positive forecast milestones can set `fields.tone = "success"` to render the `forecast_win_v1` email template; use `fields.icon_variant` (`trophy`/`award`, `medal`, `rocket`/`trendup`, or `target_hit`/`target`) and `fields.notification.headline_value` for the celebratory hero block.

For support-only traceability, events may include `fields.debug.id` and `fields.debug.event_ref`. Debug data is hidden unless `subscriber.config.debug = true` or `fields.debug.mode = "debug"`; then it renders as a discreet email debug line plus optional subject suffix. It is never used as title/subtitle/summary/detail.

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

Internal email test inboxes can enable debug rendering:

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'email',
  destination_url: 'debug@example.com',
  mode: 'alert',
  config: { debug: true, debug_subject: true },
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

### updateWatch(payload) → watch

Durably update a watch. Only provided fields change; `data.changed` reports whether `enabled` flipped.

```js
// Durably turn a watch off (reversible) — e.g. during a migration.
await headsup.disableWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});

// Re-enable it later.
await headsup.enableWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});

// Or update fields directly.
await headsup.updateWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
  cooldown_seconds: 7200,
  enabled: true,
});
```

`disableWatch` / `enableWatch` are convenience wrappers over `updateWatch` with `enabled` set. Disable is durable and reversible; for temporary suppression use `snoozeWatch` / `muteWatch`. There is no hard delete yet — disable instead.

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

### traceEvent(payload) → trace

Use after `sendEvent()` returns `queued` but no notification arrives.

```js
const trace = await headsup.traceEvent({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  idempotency_key: 'evt_001',
});

console.log(trace.summary.latest_delivery_status);
```

The trace is tenant-scoped and redacted. It includes raw event processing status, aggregate application, watch cooldown state, created alerts, delivery status, and subscriber filter routing.

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
