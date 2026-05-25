# Email Subscriber Delivery

## User Story

As a user, I need email as a delivery target so Heads Up can notify non-technical recipients without webhook infrastructure.

## Scope

- Add subscriber type `email`.
- Add delivery renderer for alert and quiet-summary email bodies.
- Add suppression/unsubscribe hooks and safe recipient validation.
- Add disable/remove API lifecycle (`admin.disableSubscriber`, `admin.deleteSubscriber`) and SDK wrappers.
- Add normalized email destination + lookup indexes for deterministic disable/unsubscribe behavior.
- Add public unsubscribe link endpoint with signed expiring tokens.
- Add docs pack: `docs/api/email-subscribers.md` and linked updates in quickstart/reference/subscribers/README.

## Acceptance Criteria

- Email subscribers can be created and receive alert deliveries.
- Invalid/suppressed recipients are not sent and are auditable.
- Email delivery state follows retry/fail semantics.
- Unsubscribe link disables the target subscriber safely and idempotently.
- Subscriber disable/delete actions work by `subscriber_id`, with email+mode lookup helper.
- Existing webhook/slack subscribers are unchanged.

## Test Plan

- Unit tests for email payload rendering and recipient validation.
- Integration tests for delivery state transitions.
- Run `npm run check`.

## API Documentation

- Update `docs/api/subscribers.md`.
- Update `docs/api/reference.md`.

## Done Definition

- Email subscriber delivery works with safe defaults and delivery tracking.
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep delivery rendering modular, preserve retry/backoff semantics, and never commit real email provider credentials.
- Write focused tests for recipient validation, suppression/unsubscribe behavior, payload rendering, retry, and failure states.
- Run `npm run check` from `apps/headsupp-api`.
- Run delivery smoke proofs when available: `npm run smoke:delivery-retry` and `npm run smoke:scheduled` if quiet summaries use email delivery.
- Update subscriber/API docs and confirm no secrets or real recipient lists are committed.

## Status

In progress (Phase A: EMAIL-01,02,03,04,09,10,12,16).
