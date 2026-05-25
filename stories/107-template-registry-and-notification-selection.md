# Template Registry And Notification Selection

## Scope

- Introduce template registry (`template_id` + metadata).
- Ship at least one responsive template (`base_alert_v1`).
- Add selection hooks by severity/type with fallback chain.

## Acceptance

- `template_id` resolves to a registered renderer.
- Missing template falls back safely.
- Scaffold supports next-round notification-type template routing.

## Status

In progress (scaffold only in this batch).
