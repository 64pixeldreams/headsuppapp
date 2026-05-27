# Heads Up API Reference (Props)

Use this after [quickstart.md](quickstart.md).

This file is the canonical property reference for integration work. It covers:

- `POST /api/function` action payloads.
- `POST /v1/events/{connector_key}` ingest payload.
- Read APIs.
- Callback payload contracts.

## Service

```text
Base URL (deployed): https://api.headsupp.io
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

## Validation And Idempotency

Admin create actions validate required fields before writing to D1. Missing required fields return a structured error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "external_user_id is required.",
    "status": 400,
    "details": {
      "action": "admin.createWorkspace",
      "field": "external_user_id"
    }
  }
}
```

Optional values are normalized to `null` before D1 writes; integrator payload mistakes should not surface as `D1_TYPE_ERROR`.

Generic create actions are fetch-or-create when a stable unique key is supplied or derivable. Duplicate creates return the canonical stored row with `created: false`. Connector secrets are returned only when the connector is newly created.

### `admin.createWorkspace`

Payload props:

- `name` (string, required): workspace display name. `display_name` is accepted as an alias.
- `workspace_key` (string, optional): stable external key.
- `source_app` (string, required): producer app label.
- `external_tenant_id` (string, required): tenant scoping key.
- `external_user_id` (string, required): user scoping key.
- `status` (string, optional): defaults to `active`.

Returns `data.workspace` and `data.created`.

### `admin.createChannel`

Payload props:

- `workspace_id` (string, required): parent workspace.
- `name` (string, required): channel display name. `display_name` is accepted as an alias.
- `channel_key` (string, optional): stable external key.
- `purpose` (string, optional): business purpose.
- `status` (string, optional): defaults to `active`.
- `source_app` (string, optional): app ownership.
- `external_tenant_id` (string, optional): tenant ownership.
- `external_user_id` (string, optional): user ownership.
- `external_resource_id` (string, optional): external entity ID.
- `metadata` (object, optional): user-defined context echoed in callbacks.

Returns `data.channel` and `data.created` with:

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
- `subscriber_type` (string, required): `webhook`, `slack_webhook`, or `email`.
- `destination_url` (string, required): https URL for webhook/slack, email address for `email`.
- `display_name` (string, optional).
- `mode` (string, optional): `alert`, `aggregate_forward`, `quiet_summary`. Defaults to `alert`.
- `config` (object, optional): receiver settings (`signing_secret` for webhook, `template_id`/`value_format`/`locale`/template labels/standard action buttons for email).
- `enabled` (boolean, optional): defaults to true.

Returns `data.subscriber` (redacted destination only), `data.created`, and optional `data.authorization`.

Email `config` supports formatted notification templates:

```json
{
  "template_id": "base_alert_v1",
  "actions": ["snooze_1h", "snooze_1d", "stop_watching"],
  "authorization": {
    "required": true,
    "ttl_seconds": 604800
  },
  "value_format": "money_usd_2",
  "locale": "en-US",
  "labels": {
    "title_template": "Highest coffee purchase: {value}",
    "summary_template": "Your highest coffee purchase reached {value}; threshold is {threshold}.",
    "current_label": "Highest purchase",
    "threshold_label": "Alert threshold"
  }
}
```

Placeholders are rendered by the mailer at delivery time:

```text
{value}, {current_value}, {threshold}, {threshold_value}, {severity}, {title}
```

`{value}` and `{threshold}` use `value_format`, so `9.5` with `money_usd_2` renders as `$9.50`.

Allowed email `actions` values:

```text
snooze_1h
snooze_6h
snooze_1d
snooze_7d
stop_watching
```

These are standard API-owned actions. Unknown values are ignored. Snooze actions use signed expiring links and create watch snooze controls. `stop_watching` opens a confirmation page before disabling the email subscriber.

Email authorization is optional and not default. When `authorization.required = true`, the subscriber starts disabled and must be confirmed through a signed email link before it receives alerts.

### `GET /v1/subscribers/confirm`

Public recipient endpoint for signed email subscription confirmation links.

Query params:

- `token` (string, required): signed confirmation token.

Behavior:

- valid token -> enables the pending email subscriber and records authorization state.
- already confirmed token -> safe "already confirmed" page.
- expired/tampered token -> safe generic HTML response and no state change.

When a `mode: "lifecycle"` webhook subscriber exists on the channel, confirmation also POSTs a `subscriber.authorized` lifecycle event to that callback URL.

### `admin.getSubscriber`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `subscriber_id` (string, optional): preferred lookup key.
- `email` (string, optional): lookup email subscriber by normalized address.
- `mode` (string, optional): disambiguates email lookup when multiple modes share an address.

Permission: `subscriber:read` or `subscriber:update`.

Returns `data.subscriber` with redacted destination, `enabled`, and sanitized `config` including `authorization` status when configured.

### `admin.listSubscribers`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `subscriber_type` (string, optional): filter by type.
- `mode` (string, optional): filter by mode.
- `enabled` (boolean, optional): filter by enabled state.

Permission: `subscriber:read` or `subscriber:update`.

Returns `data.subscribers` as a safe read list for the channel.

### `GET /v1/subscribers/email-action`

Public recipient endpoint for signed email action links.

Query params:

- `token` (string, required): signed email action token.
- `confirm` (string, optional): `1` confirms a `stop_watching` action after the confirmation page.

Behavior:

- valid snooze token -> creates or replays an idempotent watch snooze.
- valid `stop_watching` token without `confirm=1` -> returns confirmation page.
- valid `stop_watching` token with `confirm=1` -> disables the email subscriber.
- expired/tampered token -> safe generic HTML response and no state change.

### `admin.disableSubscriber`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `subscriber_id` (string, optional, recommended).
- `email` (string, optional): convenience lookup for email subscribers.
- `mode` (string, optional): helps disambiguate email lookup.

Permission: `subscriber:update`.

Returns `data.subscriber` with `enabled = 0`.

### `admin.deleteSubscriber`

Payload props:

- `workspace_id` (string, required).
- `channel_id` (string, required).
- `subscriber_id` (string, optional, recommended).
- `email` (string, optional): convenience lookup for email subscribers.
- `mode` (string, optional): helps disambiguate email lookup.

Permission: `subscriber:delete`.

Returns `data.deleted = true` when removed.

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
- `config` (object, optional): watch-specific config. Supports `renotify_policy` for repeat-notification behavior.
- `cooldown_seconds` (number, optional).
- `escalation` (object, optional).
- `recovery` (object, optional).
- `enabled` (boolean, optional).

Returns `data.watch` and `data.created`.

Noise-control props:

```text
cooldown_seconds
  Suppresses repeat alerts for the same watch for a period after an alert is emitted.

recovery
  Describes the condition that means the watch is back to normal. Recovery can emit a recovery notification after a prior trigger.

snooze / mute
  Not createWatch props. These are admin actions (`admin.snoozeWatch`, `admin.muteWatch`) that pause noisy watches after creation.
```

For market-price or tick-style signals, prefer movement watch types such as `PERCENT_CHANGE_GT`, `PERCENT_CHANGE_LT`, or `SPIKE_GT` over raw `LAST_VALUE_GT` when the user cares about movement rather than every value above a line. See [watch-types.md#avoid-noisy-alerts](watch-types.md#avoid-noisy-alerts).

For multi-bucket direction such as website views trending up/down or market feeds trending over days, use `TREND_UP_GT` or `TREND_DOWN_GT`.

Supported `renotify_policy` values:

```text
cooldown
  Default. Alert, then suppress repeats until cooldown_seconds expires.

once_until_recovered
  Alert once, then stay quiet while still triggered. A new alert can happen only after recovery is recorded.

on_escalation_only
  Planned but not implemented yet.
```

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
- [`TREND_UP_GT`](watch-types.md#trend_up_gt)
- [`TREND_DOWN_GT`](watch-types.md#trend_down_gt)
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
