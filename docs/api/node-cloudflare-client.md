# Node And Cloudflare Client

Use the private Heads Up client when you do not want to hand-write `POST /api/function` requests or connector HMAC signing.

Package:

```text
@64pixeldreams/headsupp-client
```

Location in this repository:

```text
packages/headsupp-client
```

## Install Options

### Recommended Production Path

Install the private package from GitHub Packages:

```bash
npm install @64pixeldreams/headsupp-client@0.1.0
```

This package is published from the separate private SDK repository `64pixeldreams/headsuppclientsdk`. Consumers get normal semver, lockfiles, Dependabot/private registry support, and no need to clone the Heads Up API repository.

For GitHub Packages, add this to the consuming project's `.npmrc`. Local developers need a GitHub personal access token with `read:packages`; CI should use a package-read secret such as `GH_PACKAGES_TOKEN`.

```text
@64pixeldreams:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
always-auth=true
```

GitHub Actions consumer example:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "22"
    registry-url: "https://npm.pkg.github.com"
    scope: "@64pixeldreams"
- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GH_PACKAGES_TOKEN }}
```

### Local Development Path

Use this while both repositories are on the same machine:

```bash
npm install ../headsupp/packages/headsupp-client
```

### Separate SDK Repository

The separate private repository for the wrapper is:

```text
64pixeldreams/headsuppclientsdk
```

If you install directly from Git, pin a release tag for reproducibility:

```bash
npm install git+ssh://git@github.com/64pixeldreams/headsuppclientsdk.git#v0.1.0
```

This is better than asking consumers to clone the whole Heads Up API repo.

### SDK Release Checklist

Maintainers should release from `64pixeldreams/headsuppclientsdk`:

```bash
npm test
npm version patch
git push origin main --tags
```

After the publish workflow succeeds, verify with an authenticated npm token:

```bash
npm view @64pixeldreams/headsupp-client version --registry=https://npm.pkg.github.com
```

### Clone Only The Wrapper From This Repo

Git can sparse-checkout only the wrapper folder:

```bash
git clone --filter=blob:none --no-checkout git@github.com:64pixeldreams/headsuppapp.git headsupp-sdk-only
cd headsupp-sdk-only
git sparse-checkout init --cone
git sparse-checkout set packages/headsupp-client
git checkout main
```

Then install from that folder:

```bash
cd packages/headsupp-client
npm test
```

This works for development, but it is not the best production dependency path because consumers still depend on the full API repo and a sparse-checkout workflow.

### Zero-Registry Fallback

Vendor the small source folder only when package publishing and a separate SDK repo are not available:

```text
copy packages/headsupp-client/src into the consuming project
```

If you vendor the source, keep the copyright/license notice with the copied files and track the copied commit SHA.

## Environment Variables

```bash
HEADSUPP_BASE_URL=https://headsupp_app.martin-598.workers.dev
HEADSUPP_API_KEY=<service api key>
```

Only needed for the first API-key bootstrap:

```bash
HEADSUPP_BOOTSTRAP_TOKEN=<operator bootstrap token>
```

Only needed when sending events:

```bash
HEADSUPP_CONNECTOR_KEY=<connector key>
HEADSUPP_CONNECTOR_SECRET=<connector secret>
```

## Create A Client

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});
```

## Bootstrap A Service API Key

Only do this when no service key exists yet.

```js
const operator = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  bootstrapToken: process.env.HEADSUPP_BOOTSTRAP_TOKEN,
});

const result = await operator.bootstrapServiceApiKey({
  name: 'Foretic provisioning service',
  user_id: 'service:foretic',
  source_app: 'foretic',
  permissions: [
    'workspace:create',
    'channel:create',
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

## Provision Resources

```js
const workspace = await headsup.createWorkspace({
  name: 'Demo Workspace',
  source_app: 'headsupp-demo',
  external_tenant_id: 'demo-tenant',
  external_user_id: 'demo-user',
});

const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'Demo Channel',
  purpose: 'Demo attention stream',
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
    default_bucket_types: ['minute', 'hour', 'day'],
    dimensions: ['source'],
  },
});

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

const subscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'slack_webhook',
  destination_url: process.env.HEADSUPP_SMOKE_SLACK_WEBHOOK_URL,
  display_name: '#demo-alerts',
  mode: 'alert',
});
```

Save:

```text
workspace.workspace_id
channel.channel_id
connector.connector_key
connector.connector_secret
signalResult.signal.signal_id
watch.watch_id
subscriber.subscriber_id
```

## Send A Signed Event

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
      label: 'View',
      url: 'https://example.com/demo',
    },
  },
});

console.log(accepted.queued);
```

Expected:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_demo"
}
```

## Send A Batch

```js
await headsup.sendEvents({
  connectorKey: process.env.HEADSUPP_CONNECTOR_KEY,
  connectorSecret: process.env.HEADSUPP_CONNECTOR_SECRET,
  events: [
    {
      idempotency_key: 'evt_demo_001',
      signal_key: 'demo.metric',
      occurred_at: new Date().toISOString(),
      value: { num: 15 },
    },
    {
      idempotency_key: 'evt_demo_002',
      signal_key: 'demo.metric',
      occurred_at: new Date().toISOString(),
      value: { num: 25 },
    },
  ],
});
```

## Read State

```js
const state = await headsup.getWatchState({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});

const alerts = await headsup.listChannelAlerts({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 10,
});
```

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

## Cloudflare Worker Example

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
