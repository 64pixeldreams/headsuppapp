# Subscribers API

Primary docs: use [quickstart.md](quickstart.md) for setup flow and [reference.md](reference.md) for canonical payload props. Use this file for subscriber-specific context.

Subscribers receive alert or aggregate outputs.

For outbound email delivery setup, unsubscribe lifecycle, Cloudflare binding requirements, and troubleshooting, see [email-subscribers.md](email-subscribers.md).

For a full receiver implementation guide, including signature verification and retry behavior, see [webhook-receivers.md](webhook-receivers.md).

## Routing Rule

Subscribers are channel-scoped by default. When a watch creates output for a channel, Heads Up sends that output to subscribers on the same channel whose `mode` matches the output:

```text
alert output             -> mode = alert
aggregate-forward output -> mode = aggregate_forward
quiet summary output     -> mode = quiet_summary
```

Lifecycle webhooks use `mode = lifecycle` and receive subscriber opt-in/opt-out events instead of watch output. See [webhook-receivers.md](webhook-receivers.md).

Workspace-scoped subscribers are also available for app-level alert callbacks. They receive `mode = alert` deliveries for every channel in the workspace.

MVP support:

```text
subscriber_scope = workspace
subscriber_type = webhook
mode = alert
```

## First Subscriber Types

```text
email
slack_webhook
webhook
```

Slack OAuth is not part of the current API. Slack delivery uses incoming webhooks.

Email subscribers use the same delivery queue/state pipeline and support `admin.disableSubscriber` / `admin.deleteSubscriber`.

## Alert Filters

`mode = alert` subscribers can opt into selected alert types with `config.filters`.

If no filters are configured, the subscriber receives every alert that matches the existing channel/workspace routing rule. If filters are configured, the subscriber receives an alert when it matches at least one configured filter dimension.

```json
{
  "subscriber_type": "email",
  "destination_url": "board@example.com",
  "mode": "alert",
  "subscriber_key": "foretic:forecast_123:board@example.com",
  "config": {
    "template_id": "forecast_alert_v1",
    "authorization": { "required": true },
    "filters": {
      "signal_keys": ["forecast.goal.risk"],
      "watch_group_keys": ["forecast_goal_health"],
      "watch_keys": ["watch_goal_risk_warning"],
      "band_keys": ["warning", "critical"],
      "dimensions": {
        "forecast_id": ["forecast_123", "forecast_999"]
      }
    }
  }
}
```

Filter fields:

```text
signal_keys
  Match alert signal keys, such as forecast.goal.risk.

watch_group_keys
  Match grouped policies, such as forecast_goal_health.

watch_keys
  Match stable watch IDs/keys returned by provisioning.

band_keys
  Match grouped band keys, such as warning or critical.

dimensions   (alias: fields)
  Scope alerts by event dimension value, such as forecast_id. An object of
  dimension name -> allowed string values. The value is read from the alert
  event fields (for example fields.forecast_id).
```

Matching semantics:

```text
delivered = typeMatch AND dimensionMatch

typeMatch
  true if no type filters (signal_keys / watch_group_keys / watch_keys / band_keys) are set,
  otherwise OR across the type filters that are set.

dimensionMatch
  true if no dimensions are set,
  otherwise AND across each configured dimension key (OR within one key's values).
  An alert that does not carry a configured dimension value never matches.
```

The type filters keep OR semantics, so `signal_keys: ["forecast.goal.risk"]` still receives all goal-risk alerts. `dimensions` adds an AND scope on top, so `signal_keys: ["forecast.goal.risk"]` with `dimensions: { forecast_id: ["forecast_123"] }` receives only goal-risk alerts about forecast_123. This is what lets one shared channel-per-user carry many forecasts while each recipient scopes to the forecasts they care about.

Empty arrays are treated as unset. Invalid filter values are rejected when the subscriber is created or updated. Subscribers with no `dimensions` are unaffected and keep the previous OR-only behavior.

When using `admin.provisionChannel`, set a stable `subscriber_key` per recipient. Rerunning provisioning with the same `subscriber_key` updates mutable subscriber fields such as `name`, `mode`, `enabled`, and `config.filters`, so integrators can change recipient alert preferences idempotently. Updating filters preserves email authorization and does not send another opt-in email. Changing an email destination should create a new subscriber or use an explicit reauthorization flow.

## Slack Webhook Subscriber

Foretic users create an incoming webhook URL in their own Slack workspace. Foretic sends that URL to Heads Up during provisioning.

Request shape:

```json
{
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "subscriber_type": "slack_webhook",
  "destination_url": "https://hooks.slack.com/services/...",
  "display_name": "#forecast-alerts",
  "mode": "alert",
  "config": {
    "template_id": "base_alert_slack_v1",
    "source_label": "Foretic",
    "labels": {
      "title_template": "Forecast risk: {value}%",
      "summary_template": "Goal risk reached {value}% against threshold {threshold}%."
    }
  }
}
```

Response shape:

```json
{
  "success": true,
  "data": {
    "subscriber": {
      "subscriber_id": "sub_ws_123_ch_123_slack",
      "subscriber_type": "slack_webhook",
      "display_name": "#forecast-alerts",
      "mode": "alert",
      "destination_url_redacted": "https://hooks.slack.com/services/T_TEST/...",
      "workspace_id": "ws_123",
      "channel_id": "ch_123"
    }
  }
}
```

Rules:

```text
destination_url must be https
mode must be alert, aggregate_forward, quiet_summary, or lifecycle
destination_url must look like a Slack incoming webhook for slack_webhook
workspace_id must belong to the authenticated user or service tenant context
channel_id must belong to workspace_id
subscriber stores source_app and external tenant/user fields
API responses return destination_url_redacted, not the full destination_url
```

Slack alert subscribers are for polished team-chat alerts. They render incoming-webhook-compatible Slack payloads with `text` and `blocks`, including severity, title, summary, current value, threshold, CTA button, and context. Use `labels.title_template` and `labels.summary_template` for customer-facing copy.

Example response:

```json
{
  "success": true,
  "data": {
    "subscriber": {
      "subscriber_id": "sub_ws_123_ch_123_slack",
      "subscriber_type": "slack_webhook",
      "display_name": "#forecast-alerts",
      "mode": "alert",
      "destination_url_redacted": "https://hooks.slack.com/services/T_TEST/...",
      "workspace_id": "ws_123",
      "channel_id": "ch_123"
    }
  }
}
```

## Generic Webhook Subscriber

Generic webhooks are for developer systems, AI agents, API automation, and downstream delivery. They receive structured JSON and should render their own UI if needed.

Request shape:

```json
{
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "subscriber_type": "webhook",
  "destination_url": "https://example.com/heads-up",
  "display_name": "Foretic callback",
  "mode": "alert",
  "config": {
    "filters": {
      "signal_keys": ["forecast.goal.risk"],
      "band_keys": ["critical"]
    },
    "signing_secret": "receiver_shared_secret"
  }
}
```

Workspace-scoped alert callback:

```json
{
  "workspace_id": "ws_123",
  "subscriber_scope": "workspace",
  "subscriber_type": "webhook",
  "destination_url": "https://example.com/heads-up/workspace-callback",
  "display_name": "Foretic workspace callback",
  "mode": "alert"
}
```

The response returns `"channel_id": null` for workspace subscribers. Channel-scoped subscriber responses continue to return their channel ID.

Modes:

```text
alert
aggregate_forward
quiet_summary
lifecycle
```

`quiet_summary` subscribers receive scheduled “all quiet” summaries. They do not receive normal alert payloads and do not create alert rows.

`lifecycle` subscribers receive subscriber authorization and disable/delete events for other subscribers on the same channel. Use this for third-party apps that need push notification when a recipient confirms email opt-in or opts out.

## Delivery Payloads

Slack incoming webhook payload:

```json
{
  "text": "Critical: Forecast risk: 64% Goal risk reached 64% against threshold 70%.",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "Critical: Forecast risk: 64%",
        "emoji": true
      }
    }
  ]
}
```

Generic alert webhook payload:

```json
{
  "type": "heads_up.alert",
  "schema_version": "2026-05-28",
  "alert_id": "alert_123",
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "severity": "critical",
  "summary": "Revenue forecast is critical at 64%.",
  "fields": {
    "forecast_id": "fc_123",
    "status": "critical"
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123"
  }
}
```

Alert volume is controlled before delivery by watch cooldowns, grouped winner selection, recovery rules, and subscriber filters. For AI agents or expensive APIs, prefer narrow `config.filters` and non-zero watch cooldowns.

Generic quiet-summary webhook payload:

```json
{
  "type": "heads_up.quiet_summary",
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "channel_name": "Forecasts",
  "status": "quiet",
  "generated_at": "2026-05-24T10:00:00.000Z",
  "watches": [
    {
      "watch_id": "watch_123",
      "name": "Forecast pace warning",
      "watch_type": "LAST_VALUE_LT",
      "last_status": "quiet",
      "last_evaluated_at": "2026-05-24T09:45:00.000Z",
      "last_alert_at": null,
      "cooldown_until": null,
      "updated_at": "2026-05-24T09:45:00.000Z"
    }
  ]
}
```

Slack quiet-summary payloads are concise text messages derived from the same safe payload.

Outbound webhook deliveries are signed when an outbound signing secret is configured (`subscriber.config_json.signing_secret` or `OUTBOUND_WEBHOOK_SIGNING_SECRET`):

```text
X-HeadsUp-Timestamp: <unix seconds>
X-HeadsUp-Signature: v1=<hmac_sha256_hex(timestamp + "." + raw_body)>
X-HeadsUp-Delivery-Id: <delivery id>
```

Integrations should classify generic alert callbacks by `type = "heads_up.alert"` and dedupe retries by `alert_id`. CTA fields should point back to the source system view.

Receiver-side verification example:

```js
import crypto from 'node:crypto';

export function verifyHeadsUpWebhook({ rawBody, timestamp, signature, secret }) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const provided = signature.replace(/^v1=/, '');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
```

## Delivery Retry

Alert deliveries are persisted before dispatch and processed outside ingest/watch evaluation.

```text
2xx => sent
429, 5xx, network error => retrying
400, 401, 403, 404 => failed
```

Retry backoff:

```text
attempt 1: immediate
attempt 2: +1 minute
attempt 3: +5 minutes
attempt 4: +15 minutes
attempt 5: +1 hour
attempt 6: +6 hours
then failed
```

The deployed retry smoke proves both transient and permanent paths:

```bash
cd apps/headsupp-api
npm run smoke:delivery-retry
```

Expected proof:

```text
500 or 429 response => retrying with next_retry_at
same delivery becomes sent after the receiver is changed to a 200 endpoint
404 response => failed
retrying a delivery does not create duplicate alert rows
```

## Disable Or Delete Subscribers

Disable (recommended, keeps audit trail):

```json
{
  "action": "admin.disableSubscriber",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "subscriber_id": "sub_123"
  }
}
```

Delete (hard remove):

```json
{
  "action": "admin.deleteSubscriber",
  "payload": {
    "workspace_id": "ws_123",
    "channel_id": "ch_123",
    "subscriber_id": "sub_123"
  }
}
```

## Related Stories

```text
46-slack-webhook-subscriber.md
47-generic-webhook-subscriber.md
30-webhook-alert-delivery.md
31-delivery-retry-and-backoff.md
```
