# Heads Up Client

Private Node and Cloudflare Workers SDK for the Heads Up API. Published from [`64pixeldreams/headsuppclientsdk`](https://github.com/64pixeldreams/headsuppclientsdk).

This workspace copy lives at `packages/headsupp-client` for monorepo development.

## Install

Production (GitHub Packages):

```bash
npm install @64pixeldreams/headsupp-client@0.1.1
```

Monorepo local:

```bash
npm install ../packages/headsupp-client
```

## Documentation

Full SDK docs (self-contained, SDK-first):

| Doc | Location |
|-----|----------|
| Getting started | [../../docs/public-sdk/getting-started.md](../../docs/public-sdk/getting-started.md) |
| Client reference | [../../docs/public-sdk/client-reference.md](../../docs/public-sdk/client-reference.md) |
| Cookbooks | [../../docs/public-sdk/cookbook/](../../docs/public-sdk/cookbook/) |
| Published package docs | https://github.com/64pixeldreams/headsuppclientsdk/tree/main/docs |

Sync public-sdk from SDK repo:

```bash
node scripts/sync-public-sdk-docs.mjs
```

## Environment

```bash
HEADSUPP_BASE_URL=https://api.headsupp.io
HEADSUPP_API_KEY=hu_api_...
HEADSUPP_CONNECTOR_KEY=ck_...
HEADSUPP_CONNECTOR_SECRET=hu_sec_...
```

## Minimal example

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

await headsup.sendEvent({
  connectorKey: process.env.HEADSUPP_CONNECTOR_KEY,
  connectorSecret: process.env.HEADSUPP_CONNECTOR_SECRET,
  event: {
    idempotency_key: crypto.randomUUID(),
    signal_key: 'my.signal',
    occurred_at: new Date().toISOString(),
    value: { num: 1 },
  },
});
```

See [getting-started.md](../../docs/public-sdk/getting-started.md) for the full provisioning flow.
