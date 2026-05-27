# Test Alert Delivery API

## User Story

As Foretic, I want to send a safe test alert to a selected email subscriber, so the user can verify setup without waiting for a real pace threshold transition.

## Product Fit

This supports onboarding and pilot validation for the existing alert delivery pipeline. It must not become a general notification composer.

## Scope

- Add a tenant-scoped admin action, name to confirm during implementation:
  - preferred: `admin.sendTestAlert`
- Request fields:
  - `workspace_id`
  - `channel_id`
  - `watch_id`
  - optional `subscriber_id`
  - optional `email`
  - optional `mode`
  - optional `value`
  - optional `severity`
  - optional `summary_text`
  - optional `cta`
- Behavior:
  - create a clearly marked test alert or test delivery;
  - use normal email rendering and delivery path;
  - include `test: true` in payload/context;
  - do not update watch state as a real trigger unless explicitly designed and documented;
  - do not bypass tenant scope or subscriber ownership.
- Decide whether confirmation is required:
  - default recommendation: do not deliver to unconfirmed subscribers unless `allow_unconfirmed_test` is explicitly enabled for internal/test environments.
- Return a delivery summary:
  - `alert_id` or `test_alert_id`
  - `subscriber_id`
  - `delivery_id`
  - `status`

## Out Of Scope

- Marketing emails.
- Arbitrary email body composer.
- Public unauthenticated test endpoint.
- Frontend-only test sending.

## Acceptance Criteria

- Authorized caller can send a test alert to one enabled email subscriber.
- Test alert is clearly labeled in subject/body and persisted as test metadata.
- Unconfirmed subscriber behavior is explicit and tested.
- Cooldown/snooze/mute behavior is either respected or intentionally bypassed with docs; default should be conservative.
- Full destination address and secrets are not returned.

## Test Plan

- Unit tests for request validation and tenant scope.
- Unit test for generated test alert payload and email template rendering.
- Integration test with fake email binding proving a test delivery reaches `sent`.
- Negative tests for disabled/unconfirmed subscriber unless allowed.
- SDK wrapper tests if `sendTestAlert` is exposed through the client.
- Smoke or script-level test proving the endpoint can be called safely in a deployed-like environment with fake/test delivery settings.
- Run `npm run check`.

## API Documentation

Main API docs:

- Update `docs/api/reference.md`.
- Update `docs/api/email-subscribers.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/smoke-test-suite.md` if a smoke/test command is added.
- Update `docs/api/foretic-pace-email-pilot.md` if already present, otherwise update story 06's pilot guide when created.

SDK docs:

- Update `docs/public-sdk/client-reference.md` with `sendTestAlert` if exposed.
- Update `docs/public-sdk/cookbook/email-alerts.md` with safe test-alert guidance.
- Update `packages/headsupp-client/README.md` and `headsuppclientsdk/docs/` equivalents when SDK docs change.

## Implementation Notes

- Reuse existing alert persistence and email delivery functions where possible.
- Keep the API server-side only: requires service API key with `alert:read` plus a new or existing delivery/test permission. If adding a new permission, document it.
- If this is too risky for v1, keep current synthetic-event testing and mark this story deferred.

## Done Definition

- Test alert API implemented or explicitly deferred with rationale.
- Main API docs, SDK docs, and tests updated.
- `npm run check` passes.

## Status

Pending.

## Depends On

03 is recommended so callers can check subscriber status before sending a test.
