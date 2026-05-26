# Quickstart (SDK)

This quickstart uses `@64pixeldreams/headsupp-client` only.

**Full walkthrough:** [getting-started.md](getting-started.md)

**Install:**

```bash
npm install @64pixeldreams/headsupp-client@0.1.1
```

**Minimal flow:**

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

const workspace = await headsup.createWorkspace({ name: 'Quickstart', source_app: 'demo' });
const channel = await headsup.createChannel({ workspace_id: workspace.workspace_id, name: 'Demo' });
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
const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Demo high',
  watch_type: 'LAST_VALUE_GT',
  config: { threshold: 1, severity: 'warning', bucket_type: 'minute' },
});

await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: `qs_${Date.now()}`,
    signal_key: 'demo.metric',
    occurred_at: new Date().toISOString(),
    value: { num: 10 },
  },
});
```

**Doc index:** see [README.md](../README.md).

**Raw HTTP / curl:** [appendix/raw-api-actions.md](appendix/raw-api-actions.md) (appendix only).
