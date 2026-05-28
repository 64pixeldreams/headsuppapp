# SaaS Integration Cookbook

Use this pattern for SaaS apps that want one repeatable setup call and signed event ingest.

## Model

```text
workspace = SaaS tenant/account/user
channel = alert board unless each resource needs separate consent
signal = shared semantic metric/event key
watch_group = warning/critical policy for one resource or rule
subscriber = one recipient with optional config.filters
```

For Foretic-style forecast boards, prefer one channel per alert board. Put `forecast_id` in event fields/dimensions and keep one watch group per forecast policy so cooldowns are still per forecast.

## Provision

```js
const setup = await headsup.provisionChannel({
  workspace: {
    workspace_key: 'foretic:user:123',
    name: 'Foretic user 123',
    source_app: 'foretic',
    external_tenant_id: 'user:123',
    external_user_id: 'user:123',
  },
  channel: {
    channel_key: 'foretic:user:123:board:default',
    name: 'Forecast alert board',
    metadata: { board_id: 'default' },
  },
  connector: {
    connector_key: 'ck_foretic_user_123_board_default',
  },
  signals: [
    {
      signal_key: 'forecast.pace.percent',
      value_mode: 'last',
      contract: { dimensions: ['forecast_id'], default_bucket_types: ['minute'] },
    },
  ],
  watch_groups: [
    {
      group_key: 'forecast_fc_123_pace_health',
      signal_key: 'forecast.pace.percent',
      winner_policy: 'highest_severity_wins',
      cooldown_seconds: 3600,
      bands: [
        {
          band_key: 'warning',
          severity: 'warning',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 85, bucket_type: 'minute' },
        },
        {
          band_key: 'critical',
          severity: 'critical',
          watch_type: 'LAST_VALUE_LT',
          config: { threshold: 70, bucket_type: 'minute' },
        },
      ],
    },
  ],
  subscribers: [
    {
      subscriber_key: 'foretic:user:123:ops@example.com',
      subscriber_type: 'email',
      destination_url: 'ops@example.com',
      mode: 'alert',
      config: {
        template_id: 'forecast_alert_v1',
        filters: {
          watch_group_keys: ['forecast_fc_123_pace_health'],
          band_keys: ['warning', 'critical'],
        },
      },
    },
  ],
});
```

Save `connector_key` and the one-time `connector_secret`. Repeat provisioning with the same `subscriber_key` updates mutable subscriber config such as filters without sending a new opt-in email.

## Send A Test Event

```js
await headsup.sendEvent({
  connectorKey: setup.connector.connector_key,
  connectorSecret: setup.connector.connector_secret,
  event: {
    idempotency_key: `foretic:test:${crypto.randomUUID()}`,
    signal_key: 'forecast.pace.percent',
    occurred_at: new Date().toISOString(),
    value: { num: 64 },
    fields: {
      forecast_id: 'fc_123',
      forecast_name: 'Q3 revenue',
      test: true,
    },
    dimensions: {
      forecast_id: 'fc_123',
    },
  },
});
```

## Debug A Queued Event

```js
const trace = await headsup.traceEvent({
  workspace_id: setup.workspace.workspace_id,
  channel_id: setup.channel.channel_id,
  idempotency_key: 'foretic:test:...',
});
```

Use the trace to distinguish processing delay, cooldown suppression, subscriber-filter mismatch, missing delivery rows, and provider retry/failure state.
