# Node And Cloudflare Client

Use `@64pixeldreams/headsupp-client` instead of hand-written `POST /api/function` envelopes and manual HMAC signing.

## Package

```text
@64pixeldreams/headsupp-client
```

Published from: https://github.com/64pixeldreams/headsuppclientsdk

Monorepo path: `packages/headsupp-client`

## Install

```bash
npm install @64pixeldreams/headsupp-client@0.1.1
```

GitHub Packages `.npmrc`:

```text
@64pixeldreams:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
always-auth=true
```

Monorepo local:

```bash
npm install ../packages/headsupp-client
```

## SDK documentation (start here)

These docs are SDK-first (not raw HTTP). They are synced into this repo under `docs/public-sdk/`:

| Doc | Path |
|-----|------|
| Getting started | [../public-sdk/getting-started.md](../public-sdk/getting-started.md) |
| Client reference | [../public-sdk/client-reference.md](../public-sdk/client-reference.md) |
| Quickstart | [../public-sdk/quickstart.md](../public-sdk/quickstart.md) |
| Cookbooks | [../public-sdk/cookbook/](../public-sdk/cookbook/) |
| Watch types | [../public-sdk/concepts/watch-types.md](../public-sdk/concepts/watch-types.md) |
| Webhook receivers | [../public-sdk/webhook-receivers.md](../public-sdk/webhook-receivers.md) |

Canonical source: https://github.com/64pixeldreams/headsuppclientsdk/tree/main/docs

Sync locally after SDK doc changes:

```bash
node scripts/sync-public-sdk-docs.mjs
```

## Minimal example

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

const workspace = await headsup.createWorkspace({ name: 'Demo', source_app: 'my-app' });
const channel = await headsup.createChannel({ workspace_id: workspace.workspace_id, name: 'Alerts' });
```

Full flow: [../public-sdk/getting-started.md](../public-sdk/getting-started.md).

For new third-party integrations, prefer one-call setup:

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
  watches: [
    {
      signal_key: 'forecast.revenue.pace',
      watch_key: 'pace_warning',
      name: 'Forecast pace warning',
      watch_type: 'LAST_VALUE_LT',
      config: { threshold: 85, severity: 'warning' }
    }
  ]
});
```

See [provisioning.md](provisioning.md).

## Cloudflare Workers

Pass the Worker `fetch` binding:

```js
const headsup = createHeadsUpClient({
  baseUrl: env.HEADSUPP_BASE_URL,
  apiKey: env.HEADSUPP_API_KEY,
  fetch,
});
```

## Raw HTTP API

For operators debugging actions or ingest without the SDK:

- [quickstart.md](quickstart.md)
- [reference.md](reference.md)

## Maintainer release

Release from `64pixeldreams/headsuppclientsdk`:

```bash
npm test
npm version patch
git push origin main --tags
```
