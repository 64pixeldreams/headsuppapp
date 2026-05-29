# Forecast Win Email Template

Status: implemented.

## User Story

As a SaaS integrator, I need a Heads Up-owned success email template for positive forecast milestones, so goal reached, target beaten, and ahead-of-pace events do not render with warning or danger styling.

## Scope

- Add `forecast_win_v1` as a built-in email template.
- Reuse the existing Heads Up email shell, header, footer, unsubscribe, action controls, and powered-by layout.
- Support per-event template selection with `fields.tone = "success"` or `fields.template_kind = "forecast_win"`.
- Continue supporting explicit selection with `subscriber.config.template_id` or `fields.email.template_id`.
- Render success CTA color through existing `cta.variant = "success"`.
- Add Heads Up-owned hero icon variants selected with `fields.icon_variant` or `fields.notification.icon_variant`:
  - `trophy`
  - `medal`
  - `rocket`
  - `target_hit`
  - fallback `check`
- Render `fields.notification.headline_value` and `headline_label` as the celebratory number block.
- Reuse `fields.metrics[]` first, then conventional success display fields.

## Acceptance Criteria

- `forecast_win_v1` renders success chrome while preserving the existing email layout.
- `fields.tone = "success"` routes to `forecast_win_v1`.
- `cta.variant = "success"` renders green.
- Missing `headline_value` falls back gracefully while keeping the success template.
- Tests cover success template inference, icon variants, headline rendering, metrics, footer, and CTA behavior.
- API and SDK docs include the template contract and selection guidance.
