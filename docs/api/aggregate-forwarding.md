# Aggregate Forwarding

Aggregate forwarding is the high-volume compression path. It sends one aggregate payload when a configured bucket closes, rather than forwarding raw events.

## Watch Type

`AGGREGATE_FORWARD`

Example config:

```json
{
  "bucket_type": "hour",
  "emit_after_grace_seconds": 60,
  "subscriber_id": "sub_foretic",
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

## Delivery

Closed buckets create `aggregate_deliveries` rows with stable ids and `INSERT OR IGNORE` semantics. Queue messages use:

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

Aggregate-forward webhook bodies include stable ids so Foretic can safely dedupe retries.

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "delivery_id": "aggdel_example",
  "dedupe_key": "sub_foretic:sig_123:hour:2026-05-24T10:00:00.000Z",
  "signal_key": "oxygen.percent",
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
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
  }
}
```
