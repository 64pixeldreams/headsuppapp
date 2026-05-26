# Raw HTTP API Actions (Appendix)

> Prefer [client-reference.md](../client-reference.md) for SDK integration. This file lists HTTP `action` envelopes for debugging only.

Use [getting-started.md](../getting-started.md) for the SDK path.

This file is the canonical property reference for integration work. It covers:

- `POST /api/function` action payloads.
- `POST /v1/events/{connector_key}` ingest payload.
- Read APIs.
- Callback payload contracts.

## Service

```text
Base URL (deployed): https://headsupp_app.martin-598.workers.dev
Base URL (local):    http://localhost:8787
Content-Type:        application/json
```

## Authentication

- Control-plane actions: `Authorization: Bearer <api_key>`.
- Ingest route: `X-HeadsUp-Timestamp` and `X-HeadsUp-Signature`.

## Function Envelope

All control-plane requests use:

```json
{
  "action": "admin.createWorkspace",
  "payload": {}
}
```

## Action Props

### `admin.createWorkspace`

Payload props:

- `name` (string, required): workspace display name.
- `workspace_key` (string, optional): stable external key.
- `source_app` (string, optional): producer app label.
- `external_tenant_id` (string, optional): tenant scoping key.
- `external_user_id` (string, optional): user scoping key.
- `status` (string, optional): defaults to `active`.

Returns `data.workspace`.

### `admin.createChannel`

Payload props:

- `workspace_id` (string, required): parent workspace.
- `name` (string, required): channel display name.
- `channel_key` (string, optional): stable external key.
- `purpose` (string, optional): business purpose.
- `status` (string, optional): defaults to `active`.
- `source_app` (string, optional): app ownership.
- `external_tenant_id` (string, optional): tenant ownership.
- `external_user_id` (string, optional): user ownership.
- `external_resource_id` (string, optional): external entity ID.
- `metadata` (object, optional): user-defined context echoed in callbacks.

Returns `data.channel` with:

- channel identity fields.
- ownership fields.
- `metadata` (object).
- `metadata_json` (storage field).

### `admin.getChannel`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).

Permission: `channel:read`.

Returns `data.channel`.

### `admin.updateChannel`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `name` (string, optional).
- `purpose` (string, optional).
- `metadata` (object, optional): replaces channel metadata.

Permission: `channel:update`.

Returns `data.channel`.

### `admin.createSubscriber`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `subscriber_type` (string, required): `webhook` or `slack_webhook`.
- `destination_url` (string, required, https).
- `display_name` (string, optional).
- `mode` (string, optional): `alert`, `aggregate_forward`, `quiet_summary`. Defaults to `alert`.
- `config` (object, optional): receiver settings (for example `signing_secret`).
- `enabled` (boolean, optional): defaults to true.

Returns `data.subscriber` (redacted destination only).

### `admin.createSignal`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `signal_key` (string, required): producer signal identifier.
- `signal_type` (string, optional): defaults to `metric`.
- `value_mode` (string, optional): defaults to `last`.
- `unit` (string, optional).
- `description` (string, optional).
- `contract` (object, optional): signal contract fields.
- `materialize_watch_templates` (boolean, optional): default true.

Returns `data.signal` and optional `data.signal_contract`.

### `admin.createWatch`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `signal_id` (string, required).
- `name` (string, required).
- `watch_type` (string, required).
- `config` (object, required): watch-specific config.
- `cooldown_seconds` (number, optional).
- `escalation` (object, optional).
- `recovery` (object, optional).
- `enabled` (boolean, optional).

Returns `data.watch`.

Supported watch types (explained in [watch-types.md](watch-types.md)):

- [`LAST_VALUE_GT`](watch-types.md#last_value_gt)
- [`LAST_VALUE_LT`](watch-types.md#last_value_lt)
- [`WINDOW_SUM_GT`](watch-types.md#window_sum_gt)
- [`WINDOW_AVG_GT`](watch-types.md#window_avg_gt)
- [`WINDOW_AVG_LT`](watch-types.md#window_avg_lt)
- [`WINDOW_COUNT_GT`](watch-types.md#window_count_gt)
- [`DELTA_GT`](watch-types.md#delta_gt)
- [`DELTA_LT`](watch-types.md#delta_lt)
- [`PERCENT_CHANGE_GT`](watch-types.md#percent_change_gt)
- [`PERCENT_CHANGE_LT`](watch-types.md#percent_change_lt)
- [`PREVIOUS_PERIOD_RATIO_GT`](watch-types.md#previous_period_ratio_gt)
- [`PREVIOUS_PERIOD_RATIO_LT`](watch-types.md#previous_period_ratio_lt)
- [`SPIKE_GT`](watch-types.md#spike_gt)
- [`MISSING_EXPECTED`](watch-types.md#missing_expected)
- [`REMINDER_DUE`](watch-types.md#reminder_due)
- [`DIGEST`](watch-types.md#digest)
- [`AGGREGATE_FORWARD`](aggregate-forwarding.md)

## Ingest Props (`POST /v1/events/{connector_key}`)

Headers:

- `X-HeadsUp-Timestamp` (required).
- `X-HeadsUp-Signature` (required): `sha256=<hmac>`.

Single-event payload props:

- `idempotency_key` (string, required).
- `signal_key` (string, required).
- `occurred_at` (string ISO timestamp, required).
- `value` (object, required): usually `{ "num": <number> }`.
- `fields` (object, optional): custom context.
- `cta` (object, optional): `label`, `url`, optional `kind`.

Batch payload:

```json
{
  "events": [
    { "idempotency_key": "evt_1", "signal_key": "demo.metric", "occurred_at": "2026-05-25T10:00:00.000Z", "value": { "num": 1 } }
  ]
}
```

Success response:

```json
{
  "accepted": true,
  "authenticated": true,
  "queued": 1,
  "rejected": 0,
  "connector_key": "ck_demo"
}
```

## Read API Props

### `admin.listChannelAlerts`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `limit` (number, optional, max 200).

Returns:

- `alerts` (array of safe alert rows).
- `metadata.suppressed_watch_count`.
- `metadata.as_of`.

### `admin.getWatchState`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `watch_id` (string, required).

Returns `watch_state` with timestamps and cooldown information.

### `admin.listAlertTimeline`

Payload props:

- same as `admin.listChannelAlerts`.

Returns `timeline` entries ordered by trigger time.

## Callback Payload Props

### Alert Callback (`type = heads_up.alert`)

```json
{
  "type": "heads_up.alert",
  "alert_id": "alert_123",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "signal_id": "sig_demo",
  "watch_id": "watch_demo",
  "severity": "warning",
  "summary": "Coffee weekly spend high is warning at 56.75.",
  "current_value": 56.75,
  "threshold_value": 50,
  "triggered_at": "2026-05-25T18:00:00.000Z",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026"
  },
  "fields": {
    "vendor": "local_shop"
  },
  "cta": {
    "label": "Open coffee ledger",
    "url": "https://example.com/coffee"
  }
}
```

Machine-parseable routing keys: `type`, `watch_id`, `signal_id`, `channel_metadata`.

### Aggregate Callback (`event_type = aggregate_bucket_closed`)

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "delivery_id": "aggdel_123",
  "dedupe_key": "sub_123:sig_123:hour:2026-05-25T17:00:00.000Z:d0",
  "signal_key": "spend.coffee.usd",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026"
  },
  "dimensions_hash": "d0",
  "dimensions": {},
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-25T17:00:00.000Z",
    "end_at": "2026-05-25T18:00:00.000Z"
  },
  "values": {
    "sum": 56.75,
    "count": 1,
    "avg": 56.75,
    "min": 56.75,
    "max": 56.75,
    "last": 56.75
  },
  "fields": {},
  "cta": null
}
```

### Quiet Summary Callback (`type = heads_up.quiet_summary`)

```json
{
  "type": "heads_up.quiet_summary",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "channel_name": "Coffee Spend",
  "channel_metadata": {
    "user_id": "user_demo",
    "forecast_id": "forecast_coffee_2026"
  },
  "status": "quiet",
  "generated_at": "2026-05-25T18:00:00.000Z",
  "watches": [
    {
      "watch_id": "watch_123",
      "name": "Coffee weekly spend high",
      "watch_type": "WINDOW_SUM_GT",
      "last_status": "quiet",
      "last_evaluated_at": "2026-05-25T17:59:00.000Z",
      "last_alert_at": null,
      "cooldown_until": null,
      "updated_at": "2026-05-25T17:59:00.000Z"
    }
  ]
}
```

## Retry Rules

Delivery classification:

```text
2xx => sent
429, 5xx, network error => retrying
400, 401, 403, 404 => failed
```

## Common Errors

```text
AUTH_REQUIRED
PERMISSION_DENIED
TENANT_SCOPE_MISMATCH
WORKSPACE_CHANNEL_MISMATCH
CHANNEL_NOT_FOUND
INVALID_CHANNEL_METADATA
INVALID_SIGNATURE
STALE_TIMESTAMP
INVALID_EVENT_PAYLOAD
```

## Related Docs

- [quickstart.md](quickstart.md) for the fastest path.
- [use-cases.md](use-cases.md) for scenario selection and product value mapping.
- [watch-types.md](watch-types.md) for watch behavior and config examples.
- [sdk-readme.md](sdk-readme.md) for SDK usage.
- [webhook-receivers.md](webhook-receivers.md) for receiver implementation.
- [openapi.yaml](openapi.yaml) for machine-readable endpoint schema.
