# Foretic Wrapper Guide

This guide shows how Foretic should use the private Heads Up client.

Use the wrapper so Foretic does not need to hand-write CFKit actions, response unwrapping, or connector HMAC signing.

## Install

Recommended production path:

```bash
npm install @64pixeldreams/headsupp-client
```

Use the private GitHub Packages release from `64pixeldreams/headsuppclientsdk` for Foretic production. This lets Foretic pin a version in `package-lock.json` and update intentionally.

Add this to Foretic's `.npmrc`:

```text
@64pixeldreams:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Local development install while both repositories are on one machine:

```bash
npm install ../headsupp/packages/headsupp-client
```

If private package publishing is not ready, the next best path is a separate private SDK repository:

```bash
npm install git+ssh://git@github.com/64pixeldreams/headsuppclientsdk.git
```

Avoid making Foretic depend on the whole Heads Up API repository. If you need to inspect only the wrapper from this repo, use sparse checkout:

```bash
git clone --filter=blob:none --no-checkout git@github.com:64pixeldreams/headsuppapp.git headsupp-sdk-only
cd headsupp-sdk-only
git sparse-checkout init --cone
git sparse-checkout set packages/headsupp-client
git checkout main
```

Zero-registry fallback:

```text
copy packages/headsupp-client/src into the Foretic backend
```

Recommendation: private package first, separate private SDK repo second, sparse checkout/vendor only for short-term development.

## Foretic Environment

```bash
HEADSUPP_BASE_URL=https://headsupp_app.martin-598.workers.dev
HEADSUPP_API_KEY=<foretic service api key>
```

Store connector secrets per Foretic forecast/customer after provisioning:

```text
heads_up_connector_key
heads_up_connector_secret
heads_up_workspace_id
heads_up_channel_id
heads_up_signal_id
heads_up_watch_id
```

Do not expose these values to browser clients.

## Create The Client

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

export function headsupClient(env = process.env) {
  return createHeadsUpClient({
    baseUrl: env.HEADSUPP_BASE_URL,
    apiKey: env.HEADSUPP_API_KEY,
  });
}
```

## Provision A Forecast Watch

```js
export async function provisionForecastHeadsUp({
  headsup,
  foreticUserId,
  foreticTenantId = foreticUserId,
  forecastId,
  forecastName,
  slackWebhookUrl,
  foreticCallbackUrl,
}) {
  const workspace = await headsup.createWorkspace({
    name: `Foretic / ${foreticTenantId}`,
    source_app: 'foretic',
    external_tenant_id: foreticTenantId,
    external_user_id: foreticUserId,
  });

  const channel = await headsup.createChannel({
    workspace_id: workspace.workspace_id,
    name: `Forecast: ${forecastName}`,
    channel_key: `foretic:${foreticTenantId}:forecast:${forecastId}`,
    purpose: 'forecast_attention',
    source_app: 'foretic',
    external_tenant_id: foreticTenantId,
    external_user_id: foreticUserId,
    external_resource_id: forecastId,
  });

  await headsup.createChannelContract({
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    purpose: 'Forecast attention monitoring',
    expected_signal_types: ['forecast_state'],
    default_dimensions: ['forecast_id', 'status'],
    cta_policy: { required: true, kind: 'review' },
    default_watch_templates: [],
  });

  const connector = await headsup.createConnector({
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    connector_type: 'webhook',
    source_app: 'foretic',
    external_tenant_id: foreticTenantId,
    external_user_id: foreticUserId,
    external_resource_id: forecastId,
  });

  const signalResult = await headsup.createSignal({
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    signal_key: 'forecast.revenue.pace',
    signal_type: 'forecast_state',
    value_mode: 'last',
    contract: {
      default_bucket_types: ['minute', 'hour', 'day', 'week'],
      dimensions: ['forecast_id', 'status'],
    },
  });

  const warningWatch = await headsup.createWatch({
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    signal_id: signalResult.signal.signal_id,
    name: 'Forecast pace below warning',
    watch_type: 'LAST_VALUE_LT',
    config: {
      threshold: 85,
      severity: 'warning',
      bucket_type: 'minute',
    },
    recovery: {
      enabled: true,
      condition: 'value >= 95',
      severity: 'recovery',
    },
    cooldown_seconds: 86400,
  });

  const criticalWatch = await headsup.createWatch({
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    signal_id: signalResult.signal.signal_id,
    name: 'Forecast pace below critical',
    watch_type: 'LAST_VALUE_LT',
    config: {
      threshold: 70,
      severity: 'critical',
      bucket_type: 'minute',
    },
    recovery: {
      enabled: true,
      condition: 'value >= 95',
      severity: 'recovery',
    },
    cooldown_seconds: 86400,
  });

  const subscribers = [];
  if (slackWebhookUrl) {
    subscribers.push(
      await headsup.createSubscriber({
        workspace_id: workspace.workspace_id,
        channel_id: channel.channel_id,
        subscriber_type: 'slack_webhook',
        destination_url: slackWebhookUrl,
        display_name: '#forecast-alerts',
        mode: 'alert',
      }),
    );
  }

  if (foreticCallbackUrl) {
    subscribers.push(
      await headsup.createSubscriber({
        workspace_id: workspace.workspace_id,
        channel_id: channel.channel_id,
        subscriber_type: 'webhook',
        destination_url: foreticCallbackUrl,
        display_name: 'Foretic aggregate callback',
        mode: 'aggregate_forward',
      }),
    );
  }

  return {
    workspace,
    channel,
    connector,
    signal: signalResult.signal,
    watches: [warningWatch, criticalWatch],
    subscribers,
  };
}
```

Save `connector.connector_key` and `connector.connector_secret` in Foretic server-side storage. The secret signs future forecast events.

## Send Forecast Events

```js
export async function sendForecastPaceEvent({
  headsup,
  connectorKey,
  connectorSecret,
  forecastId,
  pace,
  status,
  forecastUrl,
}) {
  return headsup.sendEvent({
    connectorKey,
    connectorSecret,
    event: {
      idempotency_key: `forecast:${forecastId}:pace:${new Date().toISOString()}`,
      signal_key: 'forecast.revenue.pace',
      occurred_at: new Date().toISOString(),
      value: { num: pace },
      fields: {
        forecast_id: forecastId,
        status,
      },
      cta: {
        label: 'View forecast',
        url: forecastUrl,
        kind: 'review',
      },
    },
  });
}
```

Expected response:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_demo"
}
```

## Verify State

```js
const state = await headsup.getWatchState({
  workspace_id: setup.workspace.workspace_id,
  channel_id: setup.channel.channel_id,
  watch_id: setup.watches[0].watch_id,
});

const alerts = await headsup.listChannelAlerts({
  workspace_id: setup.workspace.workspace_id,
  channel_id: setup.channel.channel_id,
  limit: 20,
});
```

Use this for Foretic admin/operator diagnostics. Do not show connector secrets or Slack webhooks in UI logs.

## Recommended Foretic Storage

```text
foretic_user_id
foretic_tenant_id
forecast_id
heads_up_workspace_id
heads_up_channel_id
heads_up_connector_key
heads_up_connector_secret
heads_up_signal_id
heads_up_warning_watch_id
heads_up_critical_watch_id
created_at
updated_at
```

## Failure Handling

```js
import { HeadsUpApiError } from '@64pixeldreams/headsupp-client';

try {
  await sendForecastPaceEvent({ headsup, connectorKey, connectorSecret, forecastId, pace, status, forecastUrl });
} catch (error) {
  if (error instanceof HeadsUpApiError) {
    // Log code/status/message. Do not log connectorSecret or Slack URLs.
    console.error({ code: error.code, status: error.status, message: error.message });
  }
  throw error;
}
```
