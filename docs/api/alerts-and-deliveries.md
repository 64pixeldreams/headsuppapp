# Alerts And Deliveries

Purpose: inspect alert history and watch quiet state without exposing webhook destinations or delivery secrets.

This file covers read APIs. For outbound Slack messages, generic alert callback payloads, aggregate-forward callbacks, quiet-summary callbacks, retry behavior, and signature verification, see `webhook-receivers.md`.

Authentication:

```text
POST /api/function
Authorization: Bearer <api_key>
```

Required permissions:

```text
alert:read
watch:read
```

## Channel Alerts

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

Responses include safe alert fields, CTA fields, sanitized context `fields`, `metadata.as_of`, and `metadata.suppressed_watch_count`. They do not include subscriber destinations, connector secrets, delivery response bodies, or raw webhook URLs.

Manual alert ignores use `admin.ignoreAlert`. Pending or retrying deliveries for the ignored alert are marked `ignored` and are not redelivered.

## Watch State

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

Responses include trust timestamps such as `last_evaluated_at`, `last_alert_at`, `cooldown_until`, `last_digest_at`, `last_recovery_at`, and `updated_at`.

## Alert Timeline

`admin.listAlertTimeline` accepts the same `workspace_id`, `channel_id`, and optional `limit` fields as `admin.listChannelAlerts`, returning recent safe alert records ordered by `triggered_at`.

## Tenant Rules

Reads are scoped through workspace and channel ownership. Requests outside the authenticated `source_app` or `external_tenant_id` return `TENANT_SCOPE_MISMATCH`. Channel/workspace mismatches return `WORKSPACE_CHANNEL_MISMATCH`.

Related stories: `79-alert-and-watch-state-read-api_done.md`.

Quiet summaries are delivered through `quiet_summary_deliveries` with payload type `heads_up.quiet_summary`. They are separate from alerts and do not create alert rows.

Related stories: `80-watch-action-controls-snooze-ignore-mute_done.md`, `81-quiet-status-summary-delivery_done.md`.
