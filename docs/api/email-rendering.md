# Email Rendering

Use this page when building the event payload and subscriber config that shape Heads Up alert emails.

For delivery setup, recipient lifecycle, unsubscribe behavior, and smoke commands, see [email-subscribers.md](email-subscribers.md). For logo/footer/icon identity, see [email-branding.md](email-branding.md).

## Rendering Model

Heads Up email rendering is intentionally generic:

```text
event payload + persisted alert + subscriber config + channel metadata
  -> built-in template selection
  -> safe HTML/text rendering
  -> existing email delivery path
```

Integrators provide the meaning. Heads Up owns the professional shell, escaping, CTA safety, action controls, unsubscribe links, and delivery state.

This is not Foretic-specific. Foretic forecast emails are one consumer of the same generic event fields any integration can send.

## Built-In Tier 1 Templates

```text
brand_alert_v1     Default branded alert shell with CTA and metric rows.
metric_alert_v1    Uses fields.metrics[] as the primary content block.
forecast_alert_v1  Forecast/goal pace layout driven by generic forecast fields.
forecast_win_v1    Success/win forecast layout with headline value and Heads Up icon variants.
spend_alert_v1     Spend-oriented defaults for amount/budget style alerts.
base_alert_v1      Compatibility fallback.
```

Template selection order:

```text
subscriber.config.template_by_severity[alert.severity]
fields.email.template_id
fields.tone / fields.template_kind
subscriber.config.template_id
inferred template from fields
brand_alert_v1
```

Inference rules:

```text
fields.tone = "success"
fields.template_kind = "forecast_win"
  -> forecast_win_v1

fields.event_type = "forecast_state"
fields.template_kind = "forecast"
fields.forecast_name or fields.goal_name
  -> forecast_alert_v1

fields.template_kind = "spend"
fields.merchant or fields.vendor
  -> spend_alert_v1

fields.metrics[]
  -> metric_alert_v1

otherwise
  -> brand_alert_v1
```

## Event Fields

### `fields.notification`

Use `notification` for human copy.

```json
{
  "fields": {
    "notification": {
      "title": "Generic alert template design check",
      "summary": "This alert is shaped by event metadata and subscriber branding.",
      "detail": "Use this for professional content without custom HTML.",
      "icon_url": "https://example.com/alert-icon.png"
    }
  }
}
```

Behavior:

- `title` is used for the hero title and subject body.
- `summary` is the main explanation under the severity badge.
- `detail` is optional supporting text.
- `icon_url` is an event-level hero icon override.
- All text is escaped.
- URLs must be `http` or `https`.

### `fields.metrics[]`

Use `metrics` for real-world numbers. It is the primary way to make generic alerts useful.

```json
{
  "fields": {
    "metrics": [
      { "label": "Current value", "value": "64" },
      { "label": "Target", "value": "50" },
      { "label": "Business impact", "value": "$7,500 at risk" },
      { "label": "Time left", "value": "3 days" }
    ]
  }
}
```

Rules:

- Rows render in the order supplied.
- Each row needs `label` and `value`.
- Longer explanation belongs in `fields.notification.summary` or `fields.notification.detail`.
- Metric row helper text is intentionally not rendered in the table by default.
- Heads Up does not guess currency or units when formatted strings are supplied.

### `fields.display`

Use `display` when you want conventional keys but do not want to build `metrics[]`.

```json
{
  "fields": {
    "display": {
      "current_value": "64%",
      "threshold_value": "85%",
      "actual_to_date": "$7,500",
      "target": "$10,000",
      "gap": "$2,500 behind expected pace",
      "days_remaining": "3 days"
    }
  }
}
```

The renderer prefers display strings over formatting raw numeric alert values.

### `fields.resource_name`

Use `resource_name` for the thing the alert is about.

```json
{
  "fields": {
    "resource_name": "Generic integration design check"
  }
}
```

Forecast templates also look for:

```text
fields.forecast_name
fields.goal_name
channel.name
```

## Forecast Events

Forecast emails are generic. They do not require `source_app = "foretic"`.

```json
{
  "signal_key": "forecast.revenue.pace",
  "value": { "num": 64 },
  "fields": {
    "event_type": "forecast_state",
    "forecast_name": "RB sales history (stripe)",
    "notification": {
      "title": "RB sales history (stripe)",
      "summary": "Revenue is $2,500 behind expected pace with 3 days left."
    },
    "display": {
      "actual_to_date": "$7,500",
      "target": "$10,000",
      "gap": "$2,500 behind expected pace",
      "days_remaining": "3 days",
      "pace_percent": "64%",
      "threshold_value": "85%"
    }
  },
  "cta": {
    "label": "View forecast",
    "url": "https://example.com/forecasts/rb-sales",
    "variant": "success"
  }
}
```

The same shape works for any forecast or goal integration.

## Forecast Win Events

Use `forecast_win_v1` for positive milestones such as goal reached, target beaten, period closed above target, or strongly ahead of pace. It uses the same shell, header, footer, brand block, unsubscribe link, and powered-by layout as `forecast_alert_v1`, but with success styling and a large headline value.

For one-shot milestones, pair this template with an `EVENT_OCCURRENCE` watch. That lets `forecast.goal.reached` or `forecast.bucket.closed` alert once per real occurrence key instead of relying on `LAST_VALUE_*` threshold recovery.

Template selection:

```text
fields.tone = "success"
fields.template_kind = "forecast_win"
fields.email.template_id = "forecast_win_v1"
subscriber.config.template_id = "forecast_win_v1"
```

Recommended event shape:

```json
{
  "signal_key": "forecast.goal.reached",
  "value": { "num": 1 },
  "fields": {
    "event_type": "goal_reached",
    "tone": "success",
    "icon_variant": "trophy",
    "forecast_name": "Q2 Revenue",
    "resource_name": "Q2 Revenue",
    "notification": {
      "title": "Q2 Revenue",
      "summary": "Goal reached: £10,000 hit 6 days early.",
      "detail": "Best value to date is £10,250 against a £10,000 goal.",
      "headline_value": "£10,000",
      "headline_label": "Goal reached"
    },
    "display": {
      "goal_value": "£10,000",
      "observed_to_date": "£10,250",
      "reached_on": "24 Jun 2026",
      "days_early": "6 days early"
    },
    "metrics": [
      { "label": "Goal", "value": "£10,000" },
      { "label": "Observed", "value": "£10,250" },
      { "label": "Reached on", "value": "24 Jun 2026" },
      { "label": "Days early", "value": "6" }
    ]
  },
  "cta": {
    "label": "View forecast",
    "url": "https://example.com/forecasts/q2-revenue",
    "variant": "success"
  }
}
```

Heads Up-owned `icon_variant` values:

```text
trophy      goal reached or completed
award       goal reached or completed
medal       period or bucket closed above target
rocket      strongly ahead of pace
trendup     strongly ahead of pace
target_hit  generic target met
target      generic target met
```

If `icon_variant` is absent, the template uses a default success/check badge. `fields.notification.icon_url` is still accepted as an explicit brand override, but the default path should be `icon_variant`.

The current Heads Up-owned trophy art is hosted at:

```text
trophy        https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/ce7f99d4-1b03-403d-79a0-7e2084346100/public
award         https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/df51dfa6-5392-46b6-9c01-1ddfae3f5600/public
medal         https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/ec9d77a6-8193-4631-1f06-52698ad24b00/public
target        https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/72fd0fa0-a91b-4ad4-fc9f-319d362cb500/public
trendup       https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/38fbbbf5-7a77-4382-efef-26930f115100/public
```

## CTA Button Variants

Use `cta.variant` or `cta.color_class` to set the semantic CTA color without custom HTML.

```json
{
  "cta": {
    "label": "View details",
    "url": "https://example.com/details",
    "color_class": "primary"
  }
}
```

Supported values:

```text
primary
success
warning
danger
info
dark
light
```

Invalid or missing values fall back to `dark`. Colors follow Bootstrap/Material-style semantic colors. For most alerts, use `primary` for neutral navigation, `success` for recovered/positive state, `warning` for attention, `danger` for critical/error, and `dark` for the default Heads Up style.

## Spend Events

Spend emails can use explicit metrics or conventional spend fields.

```json
{
  "signal_key": "coffee.highest_purchase",
  "value": { "num": 9.5 },
  "fields": {
    "merchant": "Blue Bottle",
    "notification": {
      "title": "Highest coffee purchase",
      "summary": "Your highest coffee purchase crossed the alert threshold."
    },
    "metrics": [
      { "label": "Amount", "value": "$9.50" },
      { "label": "Budget", "value": "$8.00" },
      { "label": "Merchant", "value": "Blue Bottle" }
    ]
  },
  "cta": {
    "label": "View coffee spend",
    "url": "https://example.com/coffee/spend",
    "color_class": "warning"
  }
}
```

## Subscriber Template Config

```json
{
  "template_id": "metric_alert_v1",
  "actions": ["snooze_1h", "snooze_1d", "stop_watching"],
  "value_format": "money_usd_2",
  "locale": "en-US",
  "labels": {
    "signal_label": "Coffee spend",
    "current_label": "Highest purchase",
    "threshold_label": "Alert threshold",
    "title_template": "Highest coffee purchase: {value}",
    "summary_template": "Your highest coffee purchase reached {value}; threshold is {threshold}."
  }
}
```

Supported placeholders:

```text
{title}
{value}
{current_value}
{threshold}
{threshold_value}
{severity}
```

Template lookup for text:

```text
title:
  fields.notification.title_template
  config.labels.title_template
  config.title_template
  generated fallback

summary:
  fields.notification.summary
  config.labels.summary_template
  config.summary_template
  generated fallback
```

If `fields.notification.title` is supplied, Heads Up does not append the raw current value to the subject title.

## CTA Rendering

Events can include one primary CTA:

```json
{
  "cta": {
    "label": "View details",
    "url": "https://example.com/details"
  }
}
```

Rules:

- `url` must be `http` or `https`.
- Invalid URLs are omitted.
- The HTML email includes a primary button and a plain fallback link.
- Plain text email includes the CTA label and URL.

## Alert Controls

Subscriber config can opt into signed action buttons:

```json
{
  "actions": ["snooze_1h", "snooze_1d", "stop_watching"]
}
```

Rendering:

- First row: up to two snooze buttons in a 50/50 layout.
- Second row: `STOP WATCHING` as a full-width button.
- Unknown action IDs are ignored.
- `stop_watching` opens a confirmation page before disabling the subscriber.

## Safety

Renderer safety rules:

- Dynamic text is HTML-escaped.
- CTA, logo, and icon URLs must be `http` or `https`.
- Raw event HTML is not rendered in Tier 1.
- Prefer source-formatted display strings for money, percent, and dates.
- Do not put secrets or private URLs in event fields.

## Design Smoke

Send one immediate email for inbox/design review:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@example.com'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='metric_alert_v1'
npm run smoke:email-design
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_DESTINATION
Remove-Item Env:HEADSUPP_SMOKE_EMAIL_TEMPLATE
```

Useful variants:

```powershell
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='brand_alert_v1'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='metric_alert_v1'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='forecast_alert_v1'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='forecast_win_v1'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='spend_alert_v1'
```
