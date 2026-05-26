# Aggregate Forwarding

`AGGREGATE_FORWARD` turns Heads Up into an aggregation gateway. Instead of forwarding every raw event, Heads Up folds events into time buckets and sends one webhook when a bucket is closed.

Canonical API documentation lives in the main API docs at `docs/api/aggregate-forwarding.md`.

## Supported Bucket Types

Heads Up currently supports:

```text
minute
hour
day
week
month
```

Bucket boundaries are UTC. Week buckets start at 00:00 UTC on Monday. Month buckets start at 00:00 UTC on the first day of the month.

`quarter` and `year` are not supported bucket types today. Forward monthly buckets and roll them up downstream if quarterly or yearly reporting is needed.

## Aggregate Values

Aggregate-forward payloads can include:

```text
sum
count
avg
min
max
last
```

These values are calculated from event `value.num`.

## SDK Example

Create an aggregate-forward subscriber:

```js
const aggregateSubscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'webhook',
  destination_url: 'https://example.com/headsupp/aggregates',
  display_name: 'Aggregate callback',
  mode: 'aggregate_forward',
  config: {
    signing_secret: process.env.HEADSUPP_AGGREGATE_SIGNING_SECRET,
  },
});
```

Create an aggregate-forward watch:

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Forward hourly aggregate',
  watch_type: 'AGGREGATE_FORWARD',
  config: {
    bucket_type: 'hour',
    emit_after_grace_seconds: 60,
    subscriber_id: aggregateSubscriber.subscriber_id,
    include: {
      sum: true,
      count: true,
      avg: true,
      min: true,
      max: true,
      last: true,
    },
  },
});
```

## Callback Payload

Heads Up sends a `POST` request to the subscriber `destination_url`:

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "signal_key": "website.form.views",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-26T10:00:00.000Z",
    "end_at": "2026-05-26T11:00:00.000Z"
  },
  "dimensions_hash": "d8f0b2c1",
  "dimensions": {
    "source": "paid_search",
    "form_id": "quote_form"
  },
  "values": {
    "sum": 428,
    "count": 428,
    "avg": 1,
    "min": 1,
    "max": 1,
    "last": 1
  },
  "delivery_id": "aggdel_abc123",
  "dedupe_key": "sub_report_aggregates:sig_form_views:hour:2026-05-26T10:00:00.000Z:d8f0b2c1"
}
```

Signed delivery headers are included when the subscriber has `config.signing_secret` or the API Worker has `OUTBOUND_WEBHOOK_SIGNING_SECRET`.
