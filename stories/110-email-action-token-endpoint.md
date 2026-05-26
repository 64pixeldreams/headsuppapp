# Email Action Token Endpoint

## User Story

As an email alert recipient, I need action buttons to be safe, scoped, expiring, and auditable so a stale or forwarded email cannot silently change unrelated watches.

## Scope

- Add signed email action tokens for standard email alert actions.
- Add a public email action endpoint for token verification and UX.
- Support MVP actions:
  - `snooze` with duration from the standard action ID,
  - `stop_watching` as a confirmation flow.
- Token payload should include:
  - `workspace_id`
  - `channel_id`
  - `watch_id`
  - `subscriber_id`
  - `alert_id` or `delivery_id`
  - action ID
  - duration seconds for snooze
  - issued-at and expiry timestamps
  - action nonce or deterministic action key for idempotency
- Use HMAC signing with current/previous secret support, matching the unsubscribe-token pattern.
- Audit every successful, expired, invalid, already-applied, and no-op action.

## Robust Link Behavior

Do not make tokens valid forever.

Recommended MVP behavior:

```text
Valid fresh snooze link
  Applies or upserts a snooze action control for that subscriber/watch scope.

Repeat click on the same snooze link
  Returns "already applied" or replays the same deterministic result without duplicate audit/action spam.

Click different snooze duration from the same email
  Allowed while token is valid. The later valid action can replace/extend the active snooze.

Expired link, for example clicked in a month
  Does not mutate state. Show a safe "This link expired" page and suggest using the latest alert email or app.

Tampered/invalid link
  Does not reveal resource existence. Show a safe generic failure page.

Deleted watch/subscriber/channel
  Does not throw. Show a safe "This alert can no longer be changed" page and audit the no-op.
```

For scanner safety, `stop_watching` should not mutate state on the first GET. It should open a signed confirmation page, then perform the disable action only after explicit confirmation.

Snooze can be one-click only if the implementation is idempotent and accepts the product risk of email security scanners. If scanner safety is prioritized, use the same confirmation pattern for snooze as `stop_watching`.

## Platform Alignment

- Reuse `action_controls` / admin snooze behavior from the existing watch action controls implementation.
- Reuse unsubscribe token helpers where appropriate, or extract shared signed-token utilities.
- Reuse audit logging patterns from unsubscribe and admin control-plane actions.
- Keep state changes tenant-scoped by workspace/channel/watch/subscriber.

## Acceptance Criteria

- Valid snooze token creates or updates the intended snooze control.
- Expired tokens do not mutate state.
- Invalid/tampered tokens return safe generic UX.
- Repeated clicks are idempotent.
- Stop-watching requires an explicit confirmation before disabling anything.
- Action links cannot affect a different workspace, channel, watch, or subscriber.
- All outcomes are audit logged without leaking secrets.

## Test Plan

- Unit tests for token signing, verification, expiry, tamper detection, and key rotation.
- Unit tests for idempotency key generation.
- Integration tests for:
  - snooze 1h/6h/1d/7d action creation,
  - repeated click behavior,
  - expired link behavior,
  - invalid token behavior,
  - stop-watching confirmation flow,
  - missing/deleted resource no-op behavior.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run smoke:action-controls` because this builds on watch action controls.

## API Documentation

- Update `docs/api/email-subscribers.md` with recipient action behavior and expiry rules.
- Update `docs/api/reference.md` with the public email action endpoint.
- Update `docs/operations-runbook.md` with troubleshooting for expired/invalid action links.

## Done Definition

- Email action links are safe enough for production email clients and forwarded emails.
- Expired month-old links fail closed and do not mutate state.
- The behavior is clear to recipients and operators.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: preserve tenant boundaries, audit state-changing actions, and never put secrets in URLs beyond signed opaque tokens.
- Prefer idempotent state transitions over duplicate rows.
- Run `npm run check` from `apps/headsupp-api`.
- Update docs in the same change.

## Status

Done.
