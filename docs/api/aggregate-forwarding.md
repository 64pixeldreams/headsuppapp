# Aggregate Forwarding

Primary docs: use `quickstart.md` for setup flow and `reference.md` for callback contract props. This file stays focused on aggregate-forward behavior.

Aggregate forwarding is the high-volume compression path. It sends one aggregate payload when a configured bucket closes, rather than forwarding raw events.

## Watch Type

`AGGREGATE_FORWARD`

Create a subscriber first:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "subscriber_type": "webhook",
    "destination_url": "https://api.example.com/heads-up/aggregates",
    "display_name": "Aggregate callback",
    "mode": "aggregate_forward"
  }
}
```

Then create the watch:

Example config:

```json
{
  "bucket_type": "hour",
  "emit_after_grace_seconds": 60,
  "subscriber_id": "sub_foretic",
  "dimensions": {
    "forecast_id": "fc_123"
  },
  "include": {
    "sum": true,
    "count": true,
    "avg": true,
    "min": true,
    "max": true,
    "last": true
  }
}
```

Full `admin.createWatch` shape:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "signal_id": "sig_123",
    "name": "Forward hourly spend",
    "watch_type": "AGGREGATE_FORWARD",
    "config": {
      "bucket_type": "hour",
      "emit_after_grace_seconds": 60,
      "subscriber_id": "sub_foretic",
      "dimensions": {
        "forecast_id": "fc_123"
      },
      "include": {
        "sum": true,
        "count": true,
        "avg": true,
        "min": true,
        "max": true,
        "last": true
      }
    }
  }
}
```

`values.max` in the callback is the highest value observed in the closed bucket. It is not a `WINDOW_MAX_GT` alert watch type.

## Delivery

Closed buckets create `aggregate_deliveries` rows with stable ids and `INSERT OR IGNORE` semantics. Delivery identity includes `subscriber_id`, `signal_id`, `bucket_type`, `bucket_start_at`, and `dimensions_hash`, so multiple forecasts, merchants, vendors, or machines can share a bucket without colliding.

Queue messages use:

```json
{
  "aggregateDeliveryId": "aggdel_example"
}
```

The deployed scheduled smoke proves this path with:

```bash
cd apps/headsupp-api
npm run smoke:scheduled
```

Expected proof:

```text
MISSING_EXPECTED creates one absence alert
DIGEST creates one digest alert and updates last_digest_at
AGGREGATE_FORWARD creates one closed-bucket delivery
the aggregate-forward payload includes delivery_id and dedupe_key
running across a later cron pass does not duplicate the same closed bucket
```

## Foretic Callback Payload

Aggregate-forward webhook bodies include stable ids so Foretic can safely dedupe retries. Payloads also include dimensions and safe latest event context when present.

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "delivery_id": "aggdel_example",
  "dedupe_key": "sub_foretic:sig_123:hour:2026-05-24T10:00:00.000Z:d7a4bf91",
  "signal_key": "oxygen.percent",
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "dimensions_hash": "d7a4bf91",
  "dimensions": {
    "forecast_id": "fc_123"
  },
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-24T10:00:00.000Z",
    "end_at": "2026-05-24T11:00:00.000Z"
  },
  "values": {
    "sum": 98,
    "count": 7,
    "avg": 14,
    "min": 4,
    "max": 21,
    "last": 4
  },
  "fields": {
    "forecast_id": "fc_123",
    "status": "warning"
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123"
  }
}
```

## Proof

`aggregate_deliveries` prevents duplicate delivery rows for the same dimensioned bucket, and queue sends are limited to newly inserted rows.

Use the focused deployed proof for dimension filtering and duplicate suppression:

```bash
cd apps/headsupp-api
npm run smoke:aggregate-forward-dimensions
```

Unit tests also cover duplicate aggregate-forward rows so an ignored insert is not re-enqueued.
