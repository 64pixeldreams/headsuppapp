# Heads Up Client

Private Node and Cloudflare Workers client for the Heads Up API.

This package is proprietary software owned by 64 Pixel Holdings LLC and operated by Inc64 LLC.

## Install

Recommended production install once private package publishing is configured:

```bash
npm install @64pixelholdings/headsupp-client
```

Private package publishing is the preferred way for Foretic and other services to consume this client.

Local workspace install while developing:

```bash
npm install ../headsupp/packages/headsupp-client
```

Zero-registry option:

```text
copy packages/headsupp-client/src into the consuming project
```

If a consumer needs a Git dependency before private publishing exists, put this package in a separate private SDK repository and install it with:

```bash
npm install git+ssh://git@github.com/64pixeldreams/headsupp-client-js.git
```

Do not make production consumers clone the full Heads Up API repo unless there is no alternative.

## Environment

```bash
HEADSUPP_BASE_URL=https://headsupp_app.martin-598.workers.dev
HEADSUPP_API_KEY=<service api key>
```

## Use

```js
import { createHeadsUpClient } from '@64pixelholdings/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

const workspace = await headsup.createWorkspace({
  name: 'Foretic Demo',
  source_app: 'foretic',
  external_tenant_id: 'foretic_org_123',
  external_user_id: 'foretic_user_456',
});

const channel = await headsup.createChannel({
  workspace_id: workspace.workspace_id,
  name: 'Forecast: May Revenue',
  purpose: 'forecast_attention',
});
```

## Send Events

```js
await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: 'foretic_fc_123_2026_05_25',
    signal_key: 'forecast.revenue.pace',
    occurred_at: new Date().toISOString(),
    value: { num: 82 },
    fields: { forecast_id: 'fc_123', status: 'warning' },
    cta: {
      label: 'View forecast',
      url: 'https://foretic.io/forecasts/fc_123',
    },
  },
});
```

## Cloudflare Workers

Pass the Worker environment values and native `fetch`:

```js
import { createHeadsUpClient } from '@64pixelholdings/headsupp-client';

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
