# Subscribers API

Subscribers receive alert or aggregate outputs.

## First Subscriber Types

```text
slack_webhook
webhook
```

Slack OAuth is not part of the MVP.

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
  "mode": "alert"
}
```

Response shape:

```json
{
  "success": true,
  "data": {
    "subscriber": {
      "subscriber_id": "sub_ws_123_ch_123_webhook",
      "subscriber_type": "webhook",
      "display_name": "Foretic callback",
      "mode": "alert",
      "destination_url_redacted": "https://api.foretic.io/heads-up/callback/...",
      "workspace_id": "ws_123",
      "channel_id": "ch_123"
    }
  }
}
```

Rules:

```text
destination_url must be https
mode must be alert or aggregate_forward
workspace/channel ownership is checked before storing
full destination_url is not returned from API responses
```

Rules:

```text
destination_url must be https
destination_url must look like a Slack incoming webhook for slack_webhook
workspace_id must belong to the authenticated user or service tenant context
channel_id must belong to workspace_id
subscriber stores source_app and external tenant/user fields
API responses return destination_url_redacted, not the full destination_url
```

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

Request shape:

```json
{
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "subscriber_type": "webhook",
  "destination_url": "https://example.com/heads-up",
  "display_name": "Foretic callback",
  "mode": "alert"
}
```

Modes:

```text
alert
aggregate_forward
```

## Delivery Payloads

Slack incoming webhook payload:

```json
{
  "text": "Revenue forecast is critical at 64%. View forecast: https://foretic.io/forecasts/fc_123"
}
```

Generic alert webhook payload:

```json
{
  "type": "heads_up.alert",
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

Outbound webhook deliveries are signed when an outbound signing secret is configured (`subscriber.config_json.signing_secret` or `OUTBOUND_WEBHOOK_SIGNING_SECRET`):

```text
X-HeadsUp-Timestamp: <unix seconds>
X-HeadsUp-Signature: v1=<hmac_sha256_hex(timestamp + "." + raw_body)>
X-HeadsUp-Delivery-Id: <delivery id>
```

Foretic should classify generic alert callbacks by `type = "heads_up.alert"` and dedupe retries by `alert_id`. CTA fields should point back to the source forecast or source system view.

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

## Related Stories

```text
46-slack-webhook-subscriber.md
47-generic-webhook-subscriber.md
30-webhook-alert-delivery.md
31-delivery-retry-and-backoff.md
```
