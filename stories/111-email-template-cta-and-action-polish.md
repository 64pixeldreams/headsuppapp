# Email Template CTA And Action Polish

## User Story

As an email alert recipient, I need the email to look professional and calm, with clear alert actions that do not overwhelm the main message.

## Scope

- Refresh the base alert template CTA styling.
- Replace the heavy full-width CTA with a compact action style:
  - uppercase text,
  - light grey background,
  - black text,
  - subtle border,
  - accessible contrast,
  - mobile-safe spacing.
- Keep the main product CTA separate from alert-control buttons.
- Render email alert-control buttons as compact chips/buttons when `config.actions` exists.
- Keep template support generic enough for future templates, but ship only `base_alert_v1` changes in MVP.

## Suggested Layout

```text
Highest coffee purchase: $9.50

[ WARNING ]

Your highest coffee purchase reached $9.50; threshold is $8.00.

Highest purchase: $9.50
Alert threshold: $8.00

[ VIEW COFFEE SPEND ]

Alert controls
[ SNOOZE 1H ] [ SNOOZE 6H ] [ SNOOZE 1D ] [ STOP WATCHING ]
```

## Platform Alignment

- Keep all template changes inside the email renderer/template registry.
- Do not introduce a new external CSS pipeline.
- Preserve plain-text output for every action shown in HTML.
- Preserve unsubscribe footer behavior.

## Acceptance Criteria

- Primary CTA is no longer full width.
- Primary CTA text is uppercase.
- Alert-control action buttons are visually secondary to the primary CTA.
- HTML and plain-text emails both include action links when configured.
- Emails without `config.actions` look clean and unchanged except for CTA polish.
- Mobile layout remains readable.

## Test Plan

- Renderer tests for HTML CTA class/style output.
- Renderer tests for plain-text action links.
- Snapshot/string assertions for configured and unconfigured action arrays.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run smoke:email-subscriber` when `SEND_EMAIL` and recipient env are configured.

## API Documentation

- Update `docs/api/email-subscribers.md` with a rendered-action example.
- Update `docs/final-smoke-runbook.md` expected email behavior if the smoke subscriber opts into actions.
- Update SDK docs/readmes if the example subscriber config includes action buttons.

## Done Definition

- The email template looks suitable for MVP consumer-facing alert controls.
- The visual hierarchy is clear: alert content first, product CTA second, alert controls third.
- No real recipient emails or provider details are committed.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep template changes focused and deterministic.
- Avoid adding a broad template engine refactor.
- Run `npm run check` from `apps/headsupp-api`.
- Update docs in the same change.

## Status

Done.
