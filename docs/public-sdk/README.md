# Heads Up Client

Private Node and Cloudflare Workers SDK for the Heads Up API.

This package is proprietary software owned by 64 Pixel Holdings LLC and operated by Inc64 LLC.

```text
POST /api/function              control-plane (wrapped by client methods)
POST /v1/events/{connectorKey}  HMAC-signed ingest (sendEvent / sendEvents)
```

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

Git fallback: `npm install git+ssh://git@github.com/64pixeldreams/headsuppclientsdk.git#v0.1.1`

Local dev: `npm install ../headsuppclientsdk`

The `docs/` folder ships in the published package.

## Environment

```bash
HEADSUPP_BASE_URL=https://your-worker.example
HEADSUPP_API_KEY=hu_api_...
HEADSUPP_BOOTSTRAP_TOKEN=...   # first API key only
HEADSUPP_CONNECTOR_KEY=ck_...
HEADSUPP_CONNECTOR_SECRET=hu_sec_...
```

## Run the getting-started script

1. Set `HEADSUPP_BASE_URL` and `HEADSUPP_API_KEY`.
2. Copy the runnable script from [docs/getting-started.md](docs/getting-started.md#runnable-script).
3. `node getting-started.mjs`

## Documentation index

| Doc | Purpose |
|-----|---------|
| [docs/getting-started.md](docs/getting-started.md) | End-to-end SDK setup through first alert |
| [docs/client-reference.md](docs/client-reference.md) | Every client method, payloads, returns |
| [docs/quickstart.md](docs/quickstart.md) | One-page minimal SDK flow |
| [docs/cookbook/webhook-alerts.md](docs/cookbook/webhook-alerts.md) | Webhook subscriber + verify callbacks |
| [docs/cookbook/email-alerts.md](docs/cookbook/email-alerts.md) | Email formatting, actions, opt-in |
| [docs/cookbook/aggregate-forwarding.md](docs/cookbook/aggregate-forwarding.md) | Closed-bucket aggregate webhooks |
| [docs/cookbook/trend-watches.md](docs/cookbook/trend-watches.md) | TREND_UP_GT / TREND_DOWN_GT |
| [docs/cookbook/noise-control.md](docs/cookbook/noise-control.md) | Cooldown, snooze, renotify policy |
| [docs/cookbook/channel-contracts.md](docs/cookbook/channel-contracts.md) | Channel contract versions |
| [docs/cookbook/subscriber-lifecycle.md](docs/cookbook/subscriber-lifecycle.md) | Disable / delete subscribers |
| [docs/concepts/watch-types.md](docs/concepts/watch-types.md) | Watch type chooser and config |
| [docs/concepts/use-cases.md](docs/concepts/use-cases.md) | Scenario guidance |
| [docs/webhook-receivers.md](docs/webhook-receivers.md) | Inbound signature verification |
| [docs/openapi.yaml](docs/openapi.yaml) | HTTP/OpenAPI snapshot |
| [docs/appendix/canonical-api-docs.md](docs/appendix/canonical-api-docs.md) | Optional links to main API repo |

## Minimal client example

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

## Canonical HTTP API (optional)

Server operators may use the main API repo: [docs/appendix/canonical-api-docs.md](docs/appendix/canonical-api-docs.md).
