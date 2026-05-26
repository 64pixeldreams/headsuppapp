# Cookbook: Aggregate Forwarding

Forward **closed** aggregate buckets to a webhook instead of per-event alert callbacks.

## Subscriber (aggregate_forward mode)

```js
const aggregateSubscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/aggregates',
  display_name: 'Hourly aggregates',
  mode: 'aggregate_forward',
  config: { signing_secret: process.env.HEADSUPP_RECEIVER_SIGNING_SECRET },
});
```

## Watch (AGGREGATE_FORWARD)

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Forward closed hour bucket',
  watch_type: 'AGGREGATE_FORWARD',
  config: {
    bucket_type: 'hour',
    subscriber_id: aggregateSubscriber.subscriber_id,
    emit_after_grace_seconds: 60,
    include: { sum: true, count: true, avg: true, min: true, max: true, last: true },
  },
});
```

Supported `bucket_type` values: `minute`, `hour`, `day`, `week`, `month` (UTC boundaries).

## Ingest events (build buckets)

```js
await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: `agg_${Date.now()}`,
    signal_key: 'orders.revenue',
    occurred_at: new Date().toISOString(),
    value: { num: 120 },
  },
});
```

## Callback payload (example)

After the bucket closes (+ grace), your webhook receives something like:

```json
{
  "type": "aggregate_forward",
  "bucket_type": "hour",
  "bucket_start_at": "2026-05-26T14:00:00.000Z",
  "bucket_end_at": "2026-05-26T15:00:00.000Z",
  "signal_key": "orders.revenue",
  "values": {
    "sum": 480,
    "count": 4,
    "avg": 120,
    "min": 80,
    "max": 150,
    "last": 120
  }
}
```

Signed with the same headers as alert webhooks. See [webhook-receivers.md](../webhook-receivers.md).

## What you should see

- No callback for the **current** open bucket until it closes
- One POST per closed bucket per watch configuration
- Week/month buckets use UTC Monday / calendar month boundaries

More detail: [concepts/aggregate-forwarding.md](../concepts/aggregate-forwarding.md).
