# Email Subscribers

Primary docs: start with [quickstart.md](quickstart.md) and [reference.md](reference.md).  
Use this guide for end-to-end email alert delivery setup, unsubscribe behavior, and troubleshooting.

Detailed email docs:

- [email-rendering.md](email-rendering.md): built-in templates, event fields, metric rows, CTA rendering, and action-control layout.
- [email-branding.md](email-branding.md): logo, title, subtitle, footer/company line, icon URLs, and the future brand model.

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
HEADSUPP_EMAIL_FOOTER_TEXT = "Fewer surprises. Just a heads up."
HEADSUPP_EMAIL_COMPANY_LINE = "INC64 LLC. 30N St Ste N, Sheridan, WY 82801."
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
      "branding": {
        "title": "Heads Up",
        "subtitle": "Coffee spend alerts",
        "brand_name": "Heads Up",
        "brand_url": "https://headsupp.io",
        "logo_url": "https://example.com/brand-logo.png",
        "accent_color": "#1f883d",
        "cta_variant": "dark",
        "footer_text": "Fewer surprises. Just a heads up.",
        "footer_brand_name": "headsupp.io",
        "footer_brand_url": "https://headsupp.io",
        "company_line": "INC64 LLC. 30N St Ste N, Sheridan, WY 82801.",
        "icons": {
          "alert_url": "https://example.com/alert-icon.svg"
        }
      },
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

## Batch Subscribe And One Opt-In Email

Integrations such as Foretic often subscribe one user to **many alerts at once**. Heads Up authorization is **per subscriber row**, not per email address globally.

### How consent is scoped today

Each email subscriber is a separate row keyed by channel identity plus email:

```text
subscriber identity = channel + subscriber_type + mode + normalized email
                     (or your stable subscriber_key override)
```

Authorization state (`pending` / `authorized`) lives on **that row**. The confirmation link enables **that one subscriber** only.

Implications:

```text
Same email, N different channels, authorization.required = true on each new subscriber
  -> up to N separate opt-in emails (one per new channel subscriber)

Same subscriber re-provisioned with upsert_existing / same subscriber_key
  -> no second opt-in email; authorized state is preserved

Same channel, same email, add config.filters on re-provision
  -> no second opt-in email; one confirmed subscriber receives more alert types
```

Heads Up does **not** currently auto-authorize other channel subscribers because the same email confirmed elsewhere in the workspace.

### Recommended pattern: one subscriber, many alerts

For batch subscribe with **one permission email**, use:

```text
1 channel per user (or per alert board)
many watches / watch_groups on that channel
1 email subscriber per recipient on that channel
config.filters to choose which alert types they receive
stable subscriber_key for idempotent upsert
```

SDK example with `admin.provisionChannel`:

```js
await headsup.provisionChannel({
  workspace: { workspace_key: 'foretic:user_abc', /* ... */ },
  channel: { channel_key: 'foretic:user_abc:alerts', /* ... */ },
  signals: [/* pace, goal risk, etc. */],
  watch_groups: [/* bands per signal */],
  subscribers: [
    {
      subscriber_key: 'foretic:user_abc:user@example.com',
      subscriber_type: 'email',
      destination_url: 'user@example.com',
      mode: 'alert',
      config: {
        authorization: { required: true },
        filters: {
          signal_keys: ['forecast.revenue.pace', 'forecast.goal.risk'],
        },
      },
    },
  ],
});
```

When the user later enables more alert types, rerun provisioning with the **same `subscriber_key`** and an expanded `config.filters` object. Heads Up upserts the subscriber and does **not** resend confirmation if already authorized.

See [provisioning.md](provisioning.md) and [subscribers.md](subscribers.md#alert-filters) for filter fields.

### Pattern to avoid

Do **not** loop `admin.createSubscriber` (or `provisionChannel`) across **many channels** for the same email with `authorization.required: true` on each unless you intentionally want **one opt-in email per channel**.

```text
Bad for single opt-in UX:
  channel A + email subscriber (authorization required)
  channel B + email subscriber (authorization required)
  channel C + email subscriber (authorization required)
  -> 3 confirmation emails

Better:
  one channel + 3 watches + 1 email subscriber + filters
  -> 1 confirmation email
```

### Foretic UI flow

```text
User selects multiple alerts in Foretic UI
  -> Foretic updates config.filters (or watch list) on one channel
  -> Foretic calls provisionChannel upsert with same subscriber_key
  -> If pending: user gets one confirm email
  -> If already authorized: no new confirm email; new filters apply immediately

User confirms once
  -> GET /v1/subscribers/confirm enables that subscriber
  -> optional lifecycle webhook: subscriber.authorized
  -> Foretic refreshes UI via getSubscriber or webhook
```

### Do Heads Up API changes be needed?

**No**, for the recommended design above. The current API already supports one opt-in for many alerts when provisioning is modeled as **one email subscriber with filters**, not one subscriber per alert channel.

Consider a future Heads Up enhancement only if product requirements demand **one channel per forecast** **and** **one global opt-in per email** (workspace-level consent or a bundled confirmation email). That is not implemented today.

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

For the full rendering contract, see [email-rendering.md](email-rendering.md). For branding and icon behavior, see [email-branding.md](email-branding.md).

Tier 1 templates are generic and reusable across integrations:

```text
brand_alert_v1     Default branded alert shell with CTA and metric rows.
metric_alert_v1    Uses fields.metrics[] as the primary content block.
forecast_alert_v1  Forecast/goal pace layout driven by generic forecast fields.
spend_alert_v1     Spend-oriented defaults for amount/budget style alerts.
base_alert_v1      Compatibility alias for the branded fallback layout.
```

These templates are not Foretic-specific. Any integration can shape the email by sending `fields.notification`, `fields.display`, `fields.metrics`, and `cta`.

### Branding and Icons

MVP branding comes from environment defaults and subscriber config:

```text
subscriber.config.branding.company_line
-> env.HEADSUPP_EMAIL_COMPANY_LINE
-> INC64 LLC. 30N St Ste N, Sheridan, WY 82801.

subscriber.config.branding.footer_brand_name
subscriber.config.branding.brand_name
-> env.HEADSUPP_EMAIL_FOOTER_BRAND_NAME
-> headsupp.io

subscriber.config.branding.footer_brand_url
subscriber.config.branding.brand_url
-> env.HEADSUPP_EMAIL_FOOTER_BRAND_URL
-> https://headsupp.io
```

Those Heads Up card-footer defaults apply when no integrator branding is present. If an email subscriber includes integrator branding, missing `footer_text` and `company_line` stay blank inside the card instead of falling back to Heads Up legal copy. A Heads Up-controlled `Powered by headsupp.io` link and platform company/address line still render below the card and are not controlled by Foretic/integrator config.

Header behavior:

- `branding.logo_url` renders a logo beside the header text.
- If no logo is set, no placeholder image or letter box is rendered.
- `branding.title` and `branding.subtitle` are optional.
- If `title`, `subtitle`, and logo are absent, the header collapses cleanly.

Hero icon behavior:

- Event-specific icon: `fields.notification.icon_url`, `fields.icon_url`, or `fields.email.icon_url`.
- Subscriber default icon: `subscriber.config.branding.icons.alert_url`, `warning_url`, `critical_url`, or `recovered_url`.
- URLs must be `http` or `https`; unsafe URLs are omitted.
- Built-in hero icons render at 128x128px.

CTA button behavior:

- Events can pass `cta.variant` or `cta.color_class`.
- Supported values are `primary`, `success`, `warning`, `danger`, `info`, `dark`, and `light`.
- Invalid or missing values fall back to `dark`.

Footer behavior:

- `branding.brand_name` and `branding.brand_url` are enough to create a linked integrator footer brand.
- `branding.footer_text` and `branding.company_line` are optional; if missing in an integrator-branded email, they stay blank inside the card.
- `Powered by headsupp.io` and the Heads Up platform address render below the card and are always controlled by Heads Up runtime policy.

Example icon URLs used by the design smoke:

```text
Coffee:   https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/3e0d7a3c-74f7-4092-c84b-fcb59cb03e00/public
Forecast: https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/129ca8d6-1dcd-4148-aac2-5e2a698fd200/public
Alert:    https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public
```

Future brand records should store image URLs and metadata, not binary image content. Integrators can keep assets in Cloudflare Images, their own CDN, or another stable public HTTPS asset host.

Planned brand model:

```json
{
  "brand_id": "foretic_default",
  "title": "Foretic",
  "subtitle": "Forecast alerts",
  "logo_url": "https://cdn.example.com/foretic-logo.png",
  "accent_color": "#1f883d",
  "brand_url": "https://foretic.io",
  "cta_variant": "success",
  "footer_text": "Fewer surprises. Just a heads up.",
  "footer_brand_name": "Foretic",
  "footer_brand_url": "https://foretic.io",
  "company_line": "Foretic Ltd.",
  "icons": {
    "forecast_url": "https://cdn.example.com/forecast-icon.svg",
    "alert_url": "https://cdn.example.com/alert-icon.svg"
  }
}
```

The future resolution order should be event `fields.email.brand_id`, subscriber `config.brand_id`, subscriber inline `config.branding`, then workspace/env defaults.

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
    "url": "https://example.com/coffee/spend",
    "color_class": "warning"
  }
}
```

Optional override (rare): `fields.notification` with custom title/summary/detail.

Rich generic alert example:

```json
{
  "signal_key": "business.metric.health",
  "occurred_at": "2026-05-25T12:00:00Z",
  "value": { "num": 64 },
  "fields": {
    "resource_name": "Generic integration design check",
    "notification": {
      "title": "Generic alert template design check",
      "summary": "This alert is shaped by event metadata and subscriber branding.",
      "detail": "Use this for professional content without custom HTML.",
      "icon_url": "https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public"
    },
    "metrics": [
      { "label": "Current value", "value": "64" },
      { "label": "Target", "value": "50" },
      { "label": "Business impact", "value": "$7,500 at risk" },
      { "label": "Time left", "value": "3 days" }
    ]
  },
  "cta": {
    "label": "View details",
    "url": "https://example.com/details",
    "variant": "primary"
  }
}
```

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

For design review, send a single rich event that triggers immediately:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@example.com'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='metric_alert_v1'
$env:HEADSUPP_SMOKE_EMAIL_ICON_URL='https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public'
npm run smoke:email-design
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_DESTINATION
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_TEMPLATE
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_ICON_URL
```

Use `HEADSUPP_SMOKE_EMAIL_TEMPLATE` with `brand_alert_v1`, `metric_alert_v1`, `forecast_alert_v1`, or `spend_alert_v1` to inspect built-in variants in a real inbox.

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
