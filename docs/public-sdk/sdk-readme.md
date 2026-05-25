# Heads Up Client

Private Node and Cloudflare Workers client for the Heads Up API.

For API onboarding, start with [quickstart.md](./quickstart.md) in the main repo, then use [reference.md](./reference.md) for all props and [use-cases.md](./use-cases.md) for scenario guidance.

This package is proprietary software owned by 64 Pixel Holdings LLC and operated by Inc64 LLC.

The client wraps:

```text
POST /api/function              control-plane actions
POST /v1/events/{connectorKey}  HMAC-signed event ingest
```

## Install

Recommended production install from GitHub Packages:

```bash
npm install @64pixeldreams/headsupp-client@0.1.0
```

For GitHub Packages, add this to the consuming project's `.npmrc`:

```text
@64pixeldreams:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
always-auth=true
```

Local developers need a GitHub token with `read:packages`. CI should use a package-read secret such as `GH_PACKAGES_TOKEN`.

Tag-pinned Git fallback:

```bash
npm install git+ssh://git@github.com/64pixeldreams/headsuppclientsdk.git#v0.1.0
```

Local workspace install while developing:

```bash
npm install ../headsupp/packages/headsupp-client
```

## Environment

```bash
HEADSUPP_BASE_URL=https://headsupp_app.martin-598.workers.dev
HEADSUPP_API_KEY=<service api key>
HEADSUPP_BOOTSTRAP_TOKEN=<operator bootstrap token only for first key creation>
HEADSUPP_CONNECTOR_KEY=<connector key for event ingest>
HEADSUPP_CONNECTOR_SECRET=<connector secret for event ingest>
```

## Create The First API Key

Only do this when no service key exists yet or when intentionally creating a new integration key.

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const operator = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  bootstrapToken: process.env.HEADSUPP_BOOTSTRAP_TOKEN,
});

const result = await operator.bootstrapServiceApiKey({
  name: 'Demo integration service',
  user_id: 'service:demo',
  source_app: 'headsupp-demo',
  permissions: [
    'workspace:create',
    'channel:create',
    'channel:read',
    'channel:update',
    'connector:create',
    'subscriber:create',
    'signal:create',
    'watch:create',
    'channel_contract:create',
    'channel_contract:update',
    'channel_contract:read',
    'alert:read',
    'watch:read',
    'watch:control',
  ],
});

console.log(result.api_key);
```

Save `api_key` in your secret manager. It is returned once.

## Create A Client

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});
```

## Provision A Channel

```js
const workspace = await headsup.createWorkspace({
  name: 'Demo Workspace',
  source_app: 'headsupp-demo',
  external_tenant_id: 'demo-tenant',
  external_user_id: 'demo-user',
});

const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'Demo Metrics',
  purpose: 'Attention-worthy metric changes',
  metadata: {
    user_id: 'user_demo',
    forecast_id: 'forecast_coffee_2026',
  },
});

const existingChannel = await headsup.getChannel({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});

await headsup.updateChannel({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  metadata: {
    ...existingChannel.metadata,
    budget_id: 'budget_coffee_primary',
  },
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
  contract: {
    default_bucket_types: ['minute', 'hour', 'day', 'week'],
    dimensions: ['source'],
  },
});
```

Save:

```text
workspace.workspace_id
channel.channel_id
connector.connector_key
connector.connector_secret
signalResult.signal.signal_id
```

## Subscribe Slack Or A Webhook

Slack alert subscriber:

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'slack_webhook',
  destination_url: process.env.SLACK_WEBHOOK_URL,
  display_name: '#ops-alerts',
  mode: 'alert',
});
```

Generic alert callback:

```js
await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/alerts',
  display_name: 'Alert callback',
  mode: 'alert',
  config: {
    signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET,
  },
});
```

Aggregate-forward callback:

```js
const aggregateSubscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/aggregates',
  display_name: 'Aggregate callback',
  mode: 'aggregate_forward',
});
```

## Create Watches

Latest value threshold:

```js
const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Demo metric high',
  watch_type: 'LAST_VALUE_GT',
  config: {
    threshold: 10,
    severity: 'warning',
    bucket_type: 'minute',
  },
  cooldown_seconds: 3600,
});
```

Weekly total:

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Weekly spend high',
  watch_type: 'WINDOW_SUM_GT',
  config: {
    threshold: 500,
    severity: 'warning',
    bucket_type: 'week',
    window: { size: 1 },
  },
});
```

Aggregate forward:

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Forward hourly aggregate',
  watch_type: 'AGGREGATE_FORWARD',
  config: {
    bucket_type: 'hour',
    emit_after_grace_seconds: 60,
    subscriber_id: aggregateSubscriber.subscriber_id,
    include: { sum: true, count: true, avg: true, min: true, max: true, last: true },
  },
});
```

See [watch-types.md](./watch-types.md) in the main repo for all supported watch types.

## Send Events

```js
const accepted = await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: 'evt_demo_001',
    signal_key: 'demo.metric',
    occurred_at: new Date().toISOString(),
    value: { num: 15 },
    fields: { source: 'demo' },
    cta: {
      label: 'View metric',
      url: 'https://example.com/metrics/demo',
    },
  },
});

console.log(accepted.queued);
```

Batch:

```js
await headsup.sendEvents({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  events: [
    {
      idempotency_key: 'evt_demo_002',
      signal_key: 'demo.metric',
      occurred_at: new Date().toISOString(),
      value: { num: 20 },
    },
    {
      idempotency_key: 'evt_demo_003',
      signal_key: 'demo.metric',
      occurred_at: new Date().toISOString(),
      value: { num: 30 },
    },
  ],
});
```

## Read Alerts And Watch State

```js
const alerts = await headsup.listChannelAlerts({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 10,
});

const state = await headsup.getWatchState({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
```

`listChannelAlerts` returns `{ alerts, metadata }`. `getWatchState` returns a watch state object or `null`.

## Action Controls

```js
await headsup.snoozeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
  snooze_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  reason: 'Maintenance window',
});

await headsup.resumeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
```

Also available: `muteWatch`, `ignoreAlert`.

## Error Handling

```js
import { HeadsUpApiError } from '@64pixeldreams/headsupp-client';

try {
  await headsup.createWorkspace({ name: 'Demo Workspace' });
} catch (error) {
  if (error instanceof HeadsUpApiError) {
    console.error(error.code, error.status, error.message);
  }
  throw error;
}
```

## Escape Hatch

Use `requestFunction` for API actions that do not yet have named SDK helpers:

```js
await headsup.requestFunction('admin.listAlertTimeline', {
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});
```

## Cloudflare Workers

Pass Worker environment values and native `fetch`:

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
        signal_key: 'worker.event',
        occurred_at: new Date().toISOString(),
        value: { num: 1 },
      },
    });

    return new Response('ok');
  },
};
```

## Test

```bash
npm test
```

## Release

The canonical SDK repository is `64pixeldreams/headsuppclientsdk`.

Public-facing SDK help docs are curated and synced from the private source repo using:

```text
docs/public-sdk
.github/workflows/sync-sdk-docs.yml
```

The sync flow opens a PR in the SDK repo after validation; it does not force-push changes.

Release checklist:

```bash
npm test
npm version patch
git push origin main --tags
```

Confirm the GitHub Actions publish workflow succeeds, then verify with an authenticated npm query:

```bash
npm view @64pixeldreams/headsupp-client version --registry=https://npm.pkg.github.com
```
