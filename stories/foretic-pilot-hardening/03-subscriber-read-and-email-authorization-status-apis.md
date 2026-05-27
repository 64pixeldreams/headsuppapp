# Subscriber Read And Email Authorization Status APIs

## User Story

As Foretic, I want to read subscriber status after creation, so the UI can show whether a user's email alert subscription is enabled, pending confirmation, disabled, or deleted.

## Product Fit

This keeps Foretic as the user-facing app while Heads Up owns subscriber delivery and email authorization state.

## Scope

- Add tenant-scoped subscriber read actions:
  - `admin.getSubscriber`
  - `admin.listSubscribers`
- `admin.getSubscriber` lookup options:
  - `workspace_id`
  - `channel_id`
  - `subscriber_id`, or
  - `email` + optional `mode`
- `admin.listSubscribers` filters:
  - `workspace_id`
  - `channel_id`
  - optional `subscriber_type`
  - optional `mode`
- Response must include safe status fields:
  - `subscriber_id`
  - `subscriber_type`
  - `mode`
  - `enabled`
  - `destination_url_redacted`
  - `normalized_destination` for email only if considered safe enough
  - `config.authorization.required`
  - `config.authorization.status`
  - `config.authorization.requested_at`
  - `config.authorization.authorized_at`
  - `created_at`
  - `updated_at`
- Never return full `destination_url` for email/webhooks.
- Support ambiguity errors for email lookup across multiple modes.

## Out Of Scope

- Resend confirmation email endpoint.
- Subscriber UI.
- Delivery history per subscriber.
- Changing public confirmation link behavior.

## Acceptance Criteria

- After creating an email subscriber with `authorization.required = true`, `admin.getSubscriber` returns `enabled = 0` and `authorization.status = pending`.
- After confirmation, `admin.getSubscriber` returns `enabled = 1` and `authorization.status = authorized`.
- `admin.listSubscribers` returns safe redacted subscribers for one channel.
- Cross-tenant reads are denied.
- Full email/webhook destination is not returned.

## Test Plan

- Unit tests for get/list response shape.
- Unit test for pending authorization status.
- Unit or integration test for confirmed status after confirmation token.
- Negative tests for cross-tenant and ambiguous email lookup.
- SDK wrapper tests for `getSubscriber` and `listSubscribers`.
- Run `npm run check`.

## API Documentation

Main API docs:

- Update `docs/api/reference.md`.
- Update `docs/api/subscribers.md`.
- Update `docs/api/email-subscribers.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/foretic-pace-email-pilot.md` if already present, otherwise update story 06's pilot guide when created.

SDK docs:

- Update `docs/public-sdk/client-reference.md` with `getSubscriber` and `listSubscribers` examples.
- Update `docs/public-sdk/cookbook/subscriber-lifecycle.md` with confirmation status reads.
- Update `packages/headsupp-client/README.md` and `headsuppclientsdk/docs/` equivalents when SDK docs change.

## Implementation Notes

- Reuse existing subscriber resolution logic from `disableAdminSubscriber` / `deleteAdminSubscriber`.
- Add SDK wrappers:
  - `getSubscriber`
  - `listSubscribers`
- Keep returned `config` sanitized to the authorization/template/action fields that are safe for UI.

## Done Definition

- Subscriber read APIs implemented.
- SDK wrappers added if this remains part of public SDK surface.
- Main API docs, SDK docs, and tests updated.
- `npm run check` passes.

## Status

Done.
