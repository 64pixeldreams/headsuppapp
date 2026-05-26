# Cookbook: Trend Watches

Detect upward or downward trends across aggregate buckets (`TREND_UP_GT`, `TREND_DOWN_GT`).

## Website form views trending up

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Form views trending up',
  watch_type: 'TREND_UP_GT',
  config: {
    threshold: 10,
    severity: 'warning',
    bucket_type: 'day',
    window: { size: 7 },
    field: 'last_value',
    method: 'first_last_percent_change',
  },
});
```

Triggers when percent change from first to last bucket in the window exceeds `threshold` (10 means 10%).

## Market price trending down

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Price trend down',
  watch_type: 'TREND_DOWN_GT',
  config: {
    threshold: 5,
    severity: 'warning',
    bucket_type: 'day',
    window: { size: 3 },
    field: 'last_value',
  },
});
```

## Send events

```js
for (const value of [100, 102, 105, 108, 112, 118, 125]) {
  await headsup.sendEvent({
    connectorKey: connector.connector_key,
    connectorSecret: connector.connector_secret,
    event: {
      idempotency_key: `trend_${value}_${Date.now()}`,
      signal_key: 'page.views',
      occurred_at: new Date().toISOString(),
      value: { num: value },
    },
  });
}
```

Use distinct `occurred_at` or bucket-aligned timestamps in production so values land in separate day buckets.

## What you should see

- `getWatchState` may show `last_status: 'triggered'` when trend exceeds threshold
- Alert/email/webhook delivery with trend context in evaluation fields
- Insufficient buckets: watch does not fire until `window.size` buckets exist

Config reference: [concepts/watch-types.md](../concepts/watch-types.md) (Trend Across Buckets).
