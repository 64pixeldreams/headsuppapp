# Email Branding

Use this page when configuring logos, header text, footer/company information, accent colors, and alert icons for Heads Up email alerts.

For template selection and event fields, see [email-rendering.md](email-rendering.md). For subscriber setup and delivery behavior, see [email-subscribers.md](email-subscribers.md).

## Current MVP Model

Branding is currently resolved from:

```text
subscriber.config.branding
environment defaults
safe hardcoded defaults
```

There is not yet a stored brand table. A future brand model is planned so integrators can create reusable brand records and reference them by id.

## Environment Defaults

Worker vars:

```toml
[vars]
HEADSUPP_EMAIL_LOGO_URL = "https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/8235abd3-01d4-4c36-9c44-8955f77cc500/public"
HEADSUPP_EMAIL_FOOTER_TEXT = "Fewer surprises. Just a heads up."
HEADSUPP_EMAIL_FOOTER_BRAND_NAME = "headsupp.io"
HEADSUPP_EMAIL_FOOTER_BRAND_URL = "https://headsupp.io"
HEADSUPP_EMAIL_POWERED_BY_NAME = "headsupp.io"
HEADSUPP_EMAIL_POWERED_BY_URL = "https://headsupp.io"
HEADSUPP_EMAIL_COMPANY_LINE = "INC64 LLC. 30N St Ste N, Sheridan, WY 82801."
```

## Brand Fallback Modes

Heads Up has two footer modes.

No integrator branding:

```text
Header/title/footer use Heads Up defaults.
Header logo uses HEADSUPP_EMAIL_LOGO_URL when configured.
Footer brand defaults to headsupp.io -> https://headsupp.io.
Footer text defaults to "Fewer surprises. Just a heads up."
Company line defaults to the INC64 legal/address line.
Powered-by renders as a Heads Up-controlled headsupp.io link.
```

Integrator branding detected:

```text
Header/logo/footer brand use integrator branding.
Missing logo_url stays blank; it does not inherit the Heads Up logo.
Missing integrator footer_text stays blank inside the card.
Missing integrator company_line stays blank inside the card.
Powered-by still renders below the card as a Heads Up-controlled headsupp.io link.
Heads Up company/address still renders below the card as the platform footer.
```

Integrator branding is detected when `subscriber.config.branding` includes any visible brand field such as `brand_name`, `brand_url`, `title`, `subtitle`, `logo_url`, `footer_brand_name`, `footer_brand_url`, `footer_text`, `company_line`, or `icons`.

This avoids mixed-brand card content where the header says Foretic but the card footer silently says INC64. Heads Up platform attribution and legal/address copy live below the card.

Default Heads Up footer resolution, when no integrator branding is present:

```text
subscriber.config.branding.footer_text
-> env.HEADSUPP_EMAIL_FOOTER_TEXT
-> "Fewer surprises. Just a heads up."
```

Default company line resolution:

```text
subscriber.config.branding.company_line
-> env.HEADSUPP_EMAIL_COMPANY_LINE
-> "INC64 LLC. 30N St Ste N, Sheridan, WY 82801."
```

Default footer brand resolution, when no integrator branding is present:

```text
subscriber.config.branding.footer_brand_name
subscriber.config.branding.brand_name
-> env.HEADSUPP_EMAIL_FOOTER_BRAND_NAME
-> "headsupp.io"

subscriber.config.branding.footer_brand_url
subscriber.config.branding.brand_url
-> env.HEADSUPP_EMAIL_FOOTER_BRAND_URL
-> "https://headsupp.io"
```

Powered-by resolution is controlled by Heads Up runtime configuration, not integrator branding, and renders below the card:

```text
env.HEADSUPP_EMAIL_POWERED_BY_NAME -> "headsupp.io"
env.HEADSUPP_EMAIL_POWERED_BY_URL -> "https://headsupp.io"
```

Treat powered-by as a commercial/billing policy. Integrators should not try to disable it in subscriber config.

## Subscriber Branding Config

```json
{
  "branding": {
    "title": "Foretic",
    "subtitle": "Forecast alerts",
    "brand_name": "Foretic",
    "brand_url": "https://foretic.io",
    "logo_url": "https://cdn.example.com/foretic-logo.png",
    "accent_color": "#1f883d",
    "cta_variant": "success",
    "footer_text": "Forecast intelligence from Foretic.",
    "footer_brand_name": "Foretic",
    "footer_brand_url": "https://foretic.io",
    "company_line": "Foretic Ltd.",
    "icons": {
      "alert_url": "https://cdn.example.com/alert-icon.png",
      "warning_url": "https://cdn.example.com/warning-icon.png",
      "critical_url": "https://cdn.example.com/critical-icon.png",
      "recovered_url": "https://cdn.example.com/recovered-icon.png"
    }
  }
}
```

Supported fields:

```text
title          Header title. Optional.
subtitle       Header subtitle. Optional.
brand_name     Brand fallback name and image alt text.
brand_url      Brand homepage URL. Used by the footer link when no footer_brand_url is set.
logo_url       Header logo URL. Optional.
accent_color   Hex brand accent for template styling. CTA colors use cta_variant.
cta_variant    Default semantic CTA color class when an event does not specify one.
footer_text    Small footer message.
footer_brand_name Brand name in the footer. Defaults to brand_name, then env, then headsupp.io.
footer_brand_url  Footer brand link URL. Defaults to brand_url, then env, then https://headsupp.io.
company_line   Legal/company line below the card.
icons          Hero icon URLs by severity or generic alert.
```

Footer behavior:

- If `footer_brand_url` or `brand_url` is a safe `http`/`https` URL, the footer brand name renders as a link.
- If no URL is provided, the brand name renders as plain text.
- Default unbranded emails render `headsupp.io` linked to `https://headsupp.io`.
- Partial integrator branding does not inherit the Heads Up footer text or INC64 company line inside the card.
- A Heads Up-controlled `Powered by headsupp.io` link and platform company/address line render below the card.

## Header Rendering

Header behavior:

- If `logo_url` exists, the logo renders on the left.
- If `logo_url` is missing, no placeholder logo or letter box is rendered.
- If `title` exists, it renders as the first header line.
- If `subtitle` exists, it renders below the title.
- If a context line exists, it renders below title/subtitle.
- If logo, title, subtitle, and context are all absent, the header collapses.

This keeps unbranded emails clean while allowing third-party apps to fully brand the header.

## Hero Icons

Hero icon resolution:

```text
fields.notification.icon_url
fields.icon_url
fields.email.icon_url
subscriber.config.branding.icons[severity]
subscriber.config.branding.icons.alert_url
fallback severity badge
```

All icon URLs must be public `http` or `https` URLs. Hero icons render at 128x128px in the built-in templates.

Example event override:

```json
{
  "fields": {
    "notification": {
      "title": "Forecast needs attention",
      "summary": "Revenue is behind pace.",
      "icon_url": "https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/129ca8d6-1dcd-4148-aac2-5e2a698fd200/public"
    }
  }
}
```

Example subscriber defaults:

```json
{
  "branding": {
    "icons": {
      "alert_url": "https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public",
      "warning_url": "https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public"
    }
  }
}
```

## Provided Test Icons

```text
Coffee:
https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/3e0d7a3c-74f7-4092-c84b-fcb59cb03e00/public

Forecast:
https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/129ca8d6-1dcd-4148-aac2-5e2a698fd200/public

Alert:
https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/7c0fd57e-0771-4b56-19bd-0df9263c1300/public
```

These are examples. Integrators can use Cloudflare Images, their own CDN, or another stable public HTTPS asset host.

## How To Store Images

Current MVP:

- Store image URLs in subscriber config or event payloads.
- Do not store binary image content in Heads Up.
- Prefer CDN-backed public HTTPS URLs.
- Use event-level icon URLs only for one-off alert-specific imagery.
- Use subscriber branding icons for stable integration identity.

Future brand model:

- Store logo/icon URLs and metadata in `email_brands`.
- Reference a brand by id from subscriber config or event fields.
- Keep image binaries outside Heads Up.

## Future Brand Model Story

Planned shape:

```json
{
  "brand_id": "foretic_default",
  "workspace_id": "ws_123",
  "name": "Foretic Default",
  "title": "Foretic",
  "subtitle": "Forecast alerts",
  "logo_url": "https://cdn.example.com/foretic-logo.png",
  "accent_color": "#1f883d",
  "cta_variant": "success",
  "footer_text": "Fewer surprises. Just a heads up.",
  "brand_url": "https://foretic.io",
  "company_line": "Foretic Ltd.",
  "icons": {
    "forecast_url": "https://cdn.example.com/forecast-icon.png",
    "alert_url": "https://cdn.example.com/alert-icon.png"
  },
  "enabled": true
}
```

Future resolution order:

```text
event fields.email.brand_id
subscriber config.brand_id
subscriber config.branding
workspace/env defaults
safe hardcoded defaults
```

Acceptance requirements for that story:

- Add `email_brands` table.
- Store public HTTPS URLs and metadata only.
- Validate URLs and accent colors.
- Add create/get/list/update/disable API actions.
- Record selected brand id/version in delivery response body.
- Keep event-level icon override available for one-off alerts.

## Design Smoke Branding Overrides

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
$env:HEADSUPP_SMOKE_EMAIL_DESTINATION='martin@example.com'
$env:HEADSUPP_SMOKE_EMAIL_TEMPLATE='metric_alert_v1'
$env:HEADSUPP_SMOKE_EMAIL_BRAND='Foretic'
$env:HEADSUPP_SMOKE_EMAIL_TITLE='Foretic'
$env:HEADSUPP_SMOKE_EMAIL_SUBTITLE='Forecast alerts'
$env:HEADSUPP_SMOKE_EMAIL_ICON_URL='https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/129ca8d6-1dcd-4148-aac2-5e2a698fd200/public'
npm run smoke:email-design
```

The smoke sends one event that triggers immediately and verifies the latest delivery reached `sent`.
