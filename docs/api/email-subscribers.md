# Email Subscribers

Primary docs: start with [quickstart.md](quickstart.md) and [reference.md](reference.md).  
Use this guide for end-to-end email alert delivery setup, unsubscribe behavior, and troubleshooting.

## What This Adds

Heads Up supports `subscriber_type: "email"` on the same delivery pipeline used for webhook subscribers:

- alert rows are persisted first,
- delivery rows are queued,
- retries/backoff apply,
- terminal states are tracked (`sent`, `retrying`, `failed`).

Email is outbound-only in this scope. Inbound email handlers are not part of this story batch.

## Cloudflare Binding Setup

Worker config must include:

```toml
[[send_email]]
name = "SEND_EMAIL"
```

Recommended vars:

```toml
[vars]
HEADSUPP_EMAIL_FROM = "alerts@headsupp.io"
HEADSUPP_EMAIL_REPLY_TO = "alerts@headsupp.io"
HEADSUPP_PUBLIC_BASE_URL = "https://api.headsupp.io"
HEADSUPP_EMAIL_ACTION_TTL_SECONDS = "604800"
HEADSUPP_UNSUBSCRIBE_TTL_SECONDS = "604800"
```

Set `HEADSUPP_EMAIL_ACTION_SECRET` for signed action buttons. If it is absent, the current unsubscribe secret is used as a fallback for MVP deployments.

Official docs: [Cloudflare Email Workers: Send email](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)

## 1) Create Email Subscriber

Use one subscriber row per recipient (best for per-user pause/remove control).

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_coffee",
    "subscriber_type": "email",
    "name": "Martin",
    "destination_url": "martin@example.com",
    "mode": "alert",
    "config": {
      "template_id": "base_alert_v1",
      "actions": ["snooze_1h", "snooze_1d", "stop_watching"],
      "authorization": {
        "required": true,
        "ttl_seconds": 604800
      },
      "value_format": "money_usd_2",
      "locale": "en-US",
      "timezone": "UTC",
      "from": {
        "email": "alerts@headsupp.io",
        "name": "Heads Up"
      },
      "reply_to": "alerts@headsupp.io",
      "labels": {
        "signal_label": "Coffee spend",
        "threshold_label": "Weekly budget",
        "title_template": "Highest coffee purchase: {value}",
        "summary_template": "Your highest coffee purchase reached {value}; threshold is {threshold}."
      },
      "template_by_severity": {
        "critical": "base_alert_v1",
        "warning": "base_alert_v1",
        "recovered": "base_alert_v1"
      }
    }
  }
}
```

Response includes canonical `subscriber_id` for disable/delete and unsubscribe lifecycle.

After a recipient confirms via `GET /v1/subscribers/confirm`, Foretic can refresh UI state with `admin.getSubscriber` or receive a push callback by creating a separate `mode: "lifecycle"` webhook subscriber on the same channel. See [webhook-receivers.md](webhook-receivers.md).

## Optional Subscriber Authorization

Email authorization is opt-in and not default. Use it when the recipient should confirm before Heads Up starts sending alerts:

```json
{
  "config": {
    "authorization": {
      "required": true,
      "ttl_seconds": 604800
    }
  }
}
```

Behavior:

```text
authorization.required absent or false
  Subscriber is enabled immediately.

authorization.required true
  Subscriber starts disabled with authorization.status = pending.
  Heads Up sends a confirmation email.
  The recipient must click the signed confirmation link before alerts can be delivered.

Expired or month-old confirmation link
  Fails closed and does not enable the subscriber.
```

Confirmation endpoint:

```text
GET /v1/subscribers/confirm?token=...
```

## Recipient Action Buttons

Email subscribers can opt into standard alert-control buttons. Heads Up owns the catalog, labels, durations, signing, and behavior. Subscriber config only chooses which standard actions appear:

```json
{
  "config": {
    "actions": ["snooze_1h", "snooze_6h", "snooze_1d", "snooze_7d", "stop_watching"]
  }
}
```

Supported MVP action IDs:

```text
snooze_1h       Snooze this watch for one hour.
snooze_6h       Snooze this watch for six hours.
snooze_1d       Snooze this watch for one day.
snooze_7d       Snooze this watch for seven days.
stop_watching   Open a confirmation page before disabling this email subscriber.
```

Unknown action IDs are ignored. Custom action URLs and custom action labels are not accepted.

Action links are signed and expiring. A valid snooze link applies a watch snooze using the same action-control system as `admin.snoozeWatch`. Re-clicking the same link is idempotent. A different valid snooze duration from the same email can replace the active snooze. A month-old or expired link does not mutate state; recipients see a safe expired-link page.

`stop_watching` is intentionally not a one-click GET mutation. The email link opens a confirmation page, then disables this email subscriber only after explicit confirmation.

Threshold editing is not part of this MVP. Use a future `manage_alert` page for threshold/cooldown/recovery editing.

## Notification Templates

Email subscribers can define lightweight text templates once in `config.labels` or directly on `config`.
Heads Up renders these templates at delivery time using formatted values. This keeps events small while still producing useful subject lines and headings.

Supported placeholders:

```text
{title}            base alert title
{value}            formatted current value
{current_value}    same as {value}
{threshold}        formatted threshold value
{threshold_value}  same as {threshold}
{severity}         alert severity
```

Example:

```json
{
  "config": {
    "value_format": "money_usd_2",
    "locale": "en-US",
    "labels": {
      "title_template": "Highest coffee purchase: {value}",
      "summary_template": "Your highest coffee purchase reached {value}; threshold is {threshold}.",
      "current_label": "Highest purchase",
      "threshold_label": "Alert threshold"
    }
  }
}
```

If the current value is `9.5` and `value_format` is `money_usd_2`, `{value}` renders as `$9.50`.

Template lookup order:

```text
title: fields.notification.title_template -> config.labels.title_template -> config.title_template -> generated fallback
summary: fields.notification.summary -> config.labels.summary_template -> config.summary_template -> generated fallback
```

Use `fields.notification.title` or `fields.notification.summary` only when a specific event needs a one-off override.

## 2) Send Events

Keep events lean; send changing facts only:

```json
{
  "signal_key": "coffee.spend",
  "occurred_at": "2026-05-25T12:00:00Z",
  "value": { "num": 42.5 },
  "fields": {
    "merchant": "Blue Bottle"
  },
  "cta": {
    "label": "View coffee spend",
    "url": "https://example.com/coffee/spend"
  }
}
```

Optional override (rare): `fields.notification` with custom title/summary/detail.

### Trigger A Test Email

Run the deployed smoke when you want to prove the full email path:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@example.com'
npm run smoke:email-subscriber
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_DESTINATION
```

The smoke provisions an email subscriber, sends normal coffee events that stay silent, then sends one `coffee.highest_purchase` trigger event. Passing output means one alert row was created and the latest email delivery reached `sent`.

## 3) What Email Gets Sent

Each email includes:

- subject (severity-prefixed),
- plain text body (always),
- responsive HTML body,
- current value + threshold (formatted),
- CTA when URL is valid,
- optional alert-control buttons when `config.actions` is set,
- unsubscribe link when `HEADSUPP_PUBLIC_BASE_URL` and unsubscribe secret are configured.

## Avoiding Too Many Emails

Email subscribers use the same watch decision rules as webhooks and Slack.

Use these controls to keep emails useful:

```text
cooldown_seconds
  Suppresses repeat emails for the same watch for a period.

recovery
  Defines when the watch is back to normal, allowing a recovery email after a prior trigger.

snooze / mute
  Lets a user/admin pause noisy watches without deleting the subscriber or watch.

PERCENT_CHANGE_* / SPIKE_GT
  Better for market-price movement than LAST_VALUE_GT when the user cares about sharp changes, not every tick above a line.
```

Coffee example:

```text
Weekly budget email
  Use WINDOW_SUM_GT with bucket_type = week.

Unusually expensive single coffee
  Use LAST_VALUE_GT with cooldown_seconds = 86400 or longer.
```

Market-price example:

```text
Meaningful movement
  Use PERCENT_CHANGE_GT or SPIKE_GT.

One alert until normal again
  Use recovery plus renotify_policy = once_until_recovered.
```

## 4) Unsubscribe and Remove Paths

### Public unsubscribe link (recipient-facing)

Email footer includes a signed, expiring unsubscribe URL:

```text
GET /v1/subscribers/unsubscribe?token=...
```

Behavior:

- valid token -> subscriber disabled (`enabled = 0`),
- invalid/expired token -> safe generic message,
- idempotent (re-click is safe).

### API disable/delete (operator-facing)

Disable by `subscriber_id` (recommended):

```json
{
  "action": "admin.disableSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_coffee",
    "subscriber_id": "sub_123"
  }
}
```

Disable by email helper:

```json
{
  "action": "admin.disableSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_coffee",
    "email": "martin@example.com",
    "mode": "alert"
  }
}
```

Delete (hard remove):

```json
{
  "action": "admin.deleteSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_coffee",
    "subscriber_id": "sub_123"
  }
}
```

## SDK Examples

```js
const subscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'email',
  name: 'Martin',
  destination_url: 'martin@example.com',
  mode: 'alert',
  config: {
    template_id: 'base_alert_v1',
    actions: ['snooze_1h', 'snooze_1d', 'stop_watching'],
    value_format: 'money_usd_2',
    locale: 'en-US',
    timezone: 'UTC',
  },
});

await headsup.disableSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_id: subscriber.subscriber_id,
});
```

## Troubleshooting

1. `SEND_EMAIL binding is not configured`  
   Add `[[send_email]] name = "SEND_EMAIL"` to Worker config.
2. `INVALID_EMAIL_RECIPIENT`  
   Use valid email in `destination_url` or `config.to`.
3. Delivery stuck in `retrying`  
   Check provider/domain status and `response_body` on delivery row.
4. `failed` after first attempt  
   Likely permanent config issue (`from`, recipient, or binding setup).
5. No unsubscribe link in email  
   Set `HEADSUPP_PUBLIC_BASE_URL` and `HEADSUPP_UNSUBSCRIBE_SECRET`.
6. No action buttons in email
   Set `config.actions`, `HEADSUPP_PUBLIC_BASE_URL`, and `HEADSUPP_EMAIL_ACTION_SECRET` (or unsubscribe secret fallback).
7. Unsubscribe link always invalid
   Verify unsubscribe secret and clock skew between generation/verification.
8. Disable by email returns ambiguous match
   Provide `mode` or disable by `subscriber_id`.
9. CTA missing in email
   URL must be `http` or `https`.
10. Values not currency/percent formatted
   Set `config.value_format` (`money_usd_2`, `money_gbp_2`, `percent_1`, etc.).
11. Webhook subscribers regressed after email rollout
    Run delivery regression tests (`npm run check`) and verify subscriber type routing.
