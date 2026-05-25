# Admin API

Primary docs: use [quickstart.md](quickstart.md) for setup flow and [reference.md](reference.md) for canonical request/response props. This file is a focused companion for admin behavior notes.

Admin operations use CFKit CloudFunctions through:

```text
POST /api/function
Authorization: Bearer <api_key>
```

The request body is:

```json
{
  "action": "admin.createWorkspace",
  "payload": {}
}
```

These functions are control-plane APIs. They are not used by the hot ingest path.

## Functions

```text
admin.createWorkspace
admin.createChannel
admin.getChannel
admin.updateChannel
admin.createConnector
admin.createSubscriber
admin.disableSubscriber
admin.deleteSubscriber
admin.createSignal
admin.createWatch
admin.createChannelContract
admin.updateChannelContract
admin.getChannelContract
admin.listChannelContractVersions
admin.listChannelAlerts
admin.getWatchState
admin.listAlertTimeline
admin.snoozeWatch
admin.muteWatch
admin.resumeWatch
admin.ignoreAlert
```

## Permissions

```text
workspace:create
channel:create
channel:read
channel:update
connector:create
subscriber:create
subscriber:update
subscriber:delete
signal:create
watch:create
channel_contract:create
channel_contract:update
channel_contract:read
alert:read
watch:read
watch:control
```

Integration service keys should include only the permissions required by the actions they call.

## Operator Functions

Bootstrap and key lifecycle functions:

```text
operator.bootstrapServiceApiKey
operator.listServiceApiKeys
operator.revokeServiceApiKey
operator.rotateServiceApiKey
operator.listAuditLogs
```

`operator.bootstrapServiceApiKey` uses the runtime-only `X-HeadsUp-Bootstrap-Token` header and does not require an existing Bearer token. The list/revoke/rotate actions require `api_key:manage`. Audit reads require `audit:read`.

## Create Workspace

```json
{
  "action": "admin.createWorkspace",
  "payload": {
    "name": "Demo Workspace",
    "source_app": "headsupp-demo",
    "external_tenant_id": "demo-tenant",
    "external_user_id": "demo-user"
  }
}
```

## Create Channel

```json
{
  "action": "admin.createChannel",
  "payload": {
    "workspace_id": "ws_123",
    "name": "Demo Spend Channel",
    "channel_key": "headsupp-demo:tenant:demo:channel:spend"
  }
}
```

## Create Connector

```json
{
  "action": "admin.createConnector",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "connector_type": "webhook"
  }
}
```

The connector secret is returned only on creation and must be stored by the producer. Connector metadata is also written to the control-plane KV lookup so the returned event URL can be used immediately for HMAC ingest.

## Create Subscriber

Slack alert subscriber:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "subscriber_type": "slack_webhook",
    "destination_url": "https://hooks.slack.com/services/T_TEST/B_TEST/SECRET",
    "display_name": "#ops-alerts",
    "mode": "alert"
  }
}
```

Generic alert callback:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "subscriber_type": "webhook",
    "destination_url": "https://api.example.com/heads-up/alerts",
    "display_name": "Alert callback",
    "mode": "alert",
    "config": {
      "signing_secret": "receiver_shared_secret"
    }
  }
}
```

Aggregate-forward callback:

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

Subscriber responses include redacted URL metadata. Do not expose real Slack webhook URLs in logs or docs. See [webhook-receivers.md](webhook-receivers.md) for callback payloads, retries, and signature verification.

## Create Signal

```json
{
  "action": "admin.createSignal",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "signal_key": "forecast.revenue.pace",
    "signal_type": "forecast_state",
    "value_mode": "last",
    "contract": {
      "default_bucket_types": ["minute", "hour", "day"],
      "dimensions": ["forecast_id", "status"]
    }
  }
}
```

If the channel has an active channel contract, `admin.createSignal` inherits `default_dimensions` and `cta_policy` into the signal contract when the payload does not provide them. Contract `default_watch_templates` are materialized into watch rows unless `materialize_watch_templates` is `false`.

## Tenant Guards

Admin actions enforce workspace/channel/signal relationships before writing referenced resources:

```text
channel.workspace_id must match payload.workspace_id
signal.workspace_id and signal.channel_id must match payload
subscriber.channel_id must belong to payload.workspace_id
connector.channel_id must belong to payload.workspace_id
watch.signal_id must belong to payload.workspace_id and channel_id
```

Common safe errors:

```text
TENANT_SCOPE_MISMATCH
WORKSPACE_CHANNEL_MISMATCH
SIGNAL_SCOPE_MISMATCH
PERMISSION_DENIED
```

## Audit Logs

Sensitive control-plane actions write safe audit rows to D1. Audit metadata redacts raw API keys, connector secrets, tokens, and webhook destinations.

## Create Watch

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "signal_id": "sig_123",
    "name": "Pace below warning",
    "watch_type": "LAST_VALUE_LT",
    "config": {
      "threshold": 85,
      "severity": "warning"
    },
    "cooldown_seconds": 3600
  }
}
```

Use [watch-types.md](watch-types.md) for plain-English examples of thresholds, totals, averages, counts, deltas, percent changes, missing expected events, reminders, digests, and aggregate forwarding.

## Channel Contracts

Channel contracts declare the intent and default shape of a channel. Create and update actions both write a new active version and archive the previous active version for the channel.

```json
{
  "action": "admin.createChannelContract",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "purpose": "Forecast attention monitoring",
    "expected_signal_types": ["forecast_state"],
    "default_dimensions": ["forecast_id", "status"],
    "default_watch_templates": [
      {
        "name": "Forecast pace below warning",
        "watch_type": "LAST_VALUE_LT",
        "config": { "threshold": 85, "severity": "warning" },
        "cooldown_seconds": 3600
      }
    ],
    "cta_policy": { "required": true, "kind": "review" }
  }
}
```

Read the active contract:

```json
{
  "action": "admin.getChannelContract",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123"
  }
}
```

List version history with `admin.listChannelContractVersions`. Contract reads and writes are tenant scoped and audited.

## Alert And Watch State Reads

Alert and quiet-state reads are safe control-plane functions. They return alert summaries, timestamps, CTA fields, and sanitized context fields. They do not return subscriber destinations, delivery response bodies, connector secrets, or raw webhook URLs.

```json
{
  "action": "admin.listChannelAlerts",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "limit": 50
  }
}
```

```json
{
  "action": "admin.getWatchState",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "watch_id": "watch_123"
  }
}
```

`admin.listAlertTimeline` returns the same safe alert shape ordered by `triggered_at` for recent channel history. `admin.listChannelAlerts` includes `metadata.suppressed_watch_count` when watches are currently in cooldown.

## Watch Action Controls

Manual attention controls are tenant-scoped and audited. They write durable action rows that the watch decision path reads before cooldown/escalation logic.

Snooze a watch until a timestamp:

```json
{
  "action": "admin.snoozeWatch",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "watch_id": "watch_123",
    "snooze_until": "2026-05-24T12:00:00.000Z",
    "reason": "Known maintenance window"
  }
}
```

Mute a watch or signal:

```json
{
  "action": "admin.muteWatch",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "signal_id": "sig_123",
    "reason": "Temporarily noisy source"
  }
}
```

Resume clears active snooze/mute controls for the watch or signal and writes a completed resume action:

```json
{
  "action": "admin.resumeWatch",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "watch_id": "watch_123"
  }
}
```

Ignore an alert marks pending/retrying deliveries for that alert as `ignored` so it is not redelivered:

```json
{
  "action": "admin.ignoreAlert",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "alert_id": "alert_123",
    "reason": "Already handled"
  }
}
```
