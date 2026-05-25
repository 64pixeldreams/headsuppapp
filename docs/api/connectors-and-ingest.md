# Connectors And Event Ingest

Connectors authenticate event producers and map incoming events to the correct Heads Up tenant, workspace, and channel.

## Ingest Endpoint

```text
POST /v1/events/{connector_key}
```

Forecast watch provisioning returns the connector key and event URL:

```json
{
  "connector": {
    "connector_type": "webhook",
    "connector_key": "ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook",
    "connector_secret": "shown_once"
  },
  "event_url": "https://headsupp_app.example.workers.dev/v1/events/ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook"
}
```

The `connector_secret` is shown once at connector creation. Store it in Foretic and use it to sign every ingest request.

## Authentication

Headers:

```text
X-HeadsUp-Timestamp: 2026-05-24T10:00:00Z
X-HeadsUp-Signature: sha256=<signature>
```

Signature payload:

```text
timestamp + "." + raw_body
```

Rules:

```text
single event and { "events": [...] } batch payloads are accepted
each event requires signal_key and occurred_at
numeric value can come from contract value_path or fallback value.num
fields and cta must be objects when present
batch messages are split into RAW_EVENTS_QUEUE sendBatch chunks of 100
timestamp must be within allowed skew
signature must match connector secret
connector must be active
ownership is resolved from connector, not request body
signature comparison uses constant-time byte comparison
```

Example signing input:

```text
2026-05-24T10:00:00Z.{"idempotency_key":"evt_001","signal_key":"forecast.revenue.pace"}
```

Example response after connector authentication succeeds and raw event messages are queued:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_foretic_user_mkfoxvxgoyfbtd_forecast_oracle_forecast_mlfl1bfqrxnbk1_webhook"
}
```

## Single Event

```json
{
  "idempotency_key": "foretic_fc123_2026_05_24_1000",
  "signal_key": "forecast.revenue.pace",
  "occurred_at": "2026-05-24T10:00:00Z",
  "value": {
    "num": 64
  },
  "fields": {
    "forecast_id": "fc_123",
    "forecast_name": "Repairs By Post May Revenue",
    "pace_percent": 64,
    "status": "critical"
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123",
    "kind": "review"
  }
}
```

## Foretic Forecast State Event

Foretic emits forecast state into the connector returned by `foretic.createForecastWatch`.

```json
{
  "idempotency_key": "foretic:oracle_forecast:mlfl1bfqrxnbk1:forecast_state:2026-05-24T10:00:00.000Z",
  "signal_key": "forecast.revenue.pace",
  "occurred_at": "2026-05-24T10:00:00.000Z",
  "value": {
    "num": 84
  },
  "fields": {
    "event_type": "forecast_state",
    "forecast_id": "oracle_forecast:mlfl1bfqrxnbk1",
    "forecast_name": "RB sales history (stripe)",
    "pace_percent": 84,
    "status": "warning"
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/oracle_forecast:mlfl1bfqrxnbk1",
    "kind": "review"
  }
}
```

Status guidance:

```text
pace < 70  -> critical
pace < 85  -> warning
pace > 95  -> recovered
otherwise  -> ok
```

## Batch Event

```json
{
  "events": [
    {
      "idempotency_key": "evt_001",
      "signal_key": "oxygen.percent",
      "occurred_at": "2026-05-24T10:00:00Z",
      "value": { "num": 10 }
    }
  ]
}
```

## Response

```json
{
  "accepted": true,
  "queued": 1,
  "rejected": 0
}
```

## Raw Queue Consumer

The queue consumer processes raw messages in this order:

```text
validate event shape again
mark raw_event_dedupe status as processing
skip aggregate/watch work for already-processed idempotency keys
skip aggregate mutation but retry watch invocation when aggregate_applied_at exists without processed_at
resolve or lazily create signal and signal_contract
inherit active channel contract default dimensions and CTA policy when a signal_contract is created
extract value/time/cta from contract paths with value.num fallback
create aggregate deltas for configured bucket types
fold deltas by workspace/channel/signal/bucket/dimensions_hash
upsert aggregates with SQL ON CONFLICT and timestamp-safe last_value update
invoke WATCH_EVALUATOR for affected active watches
mark aggregate_applied_at in the same D1 batch as the aggregate mutation
mark dedupe status as processed only after successful aggregate and watch steps
```

Watch evaluation is invoked through `WATCH_EVALUATOR.idFromName(watchId)` with:

```json
{
  "watchId": "watch_warning",
  "reason": "aggregate_updated",
  "signalId": "sig_123",
  "bucketType": "hour",
  "bucketStartAt": "2026-05-24T10:00:00.000Z",
  "dimensionsHash": "d7a4bf91",
  "dimensionsJson": "{\"forecast_id\":\"fc_123\",\"status\":\"critical\"}",
  "eventContext": {
    "cta": { "label": "View forecast", "url": "https://foretic.io/forecasts/fc_123" },
    "fields": { "forecast_id": "fc_123", "status": "critical" }
  },
  "now": "2026-05-24T10:05:00.000Z"
}
```

`WatchEvaluatorDO` loads the watch and aggregate rows, evaluates supported last-value/window/delta watches, applies cooldown/escalation/recovery decisions, persists alerts with delivery rows, and enqueues alert delivery messages. Digest, missing-expected, quiet summary, delivery retry, dedupe cleanup, and aggregate-forward evaluation run from scheduled work.

## Related Stories

```text
14-hmac-webhook-authentication.md
16-single-and-batch-event-ingest.md
17-raw-events-queue.md
49-connector-secret-and-hmac-ingest-auth.md
```
