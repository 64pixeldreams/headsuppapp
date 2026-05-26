# Email Subscriber Authorization Opt-In

## User Story

As an integrator, I need optional recipient authorization for email subscribers so consumer-facing products can require a user to confirm before Heads Up starts sending alerts.

## Product Fit

This is useful when the recipient did not directly create the subscriber inside the integration product, or when the product needs double opt-in style consent. It must not be default because many integrations already own consent and should not add extra friction.

## Scope

- Add optional email subscriber authorization config:

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

- When `authorization.required = true`, create the email subscriber disabled until confirmed.
- Store authorization state in `config_json`, for example:

```json
{
  "authorization": {
    "required": true,
    "status": "pending",
    "requested_at": "2026-05-26T00:00:00.000Z",
    "authorized_at": null
  }
}
```

- Send a confirmation email using the same Cloudflare `SEND_EMAIL` binding and email module boundaries.
- Add a signed expiring confirmation token with current/previous secret support.
- Add a public confirmation endpoint that enables the subscriber only after a valid token is clicked.
- Keep webhook/slack subscribers unchanged.

## Robust Link Behavior

```text
Fresh valid confirmation link
  Enables the subscriber and records authorized_at.

Already confirmed link
  Shows "already confirmed" and does not duplicate side effects.

Expired link, for example clicked in a month
  Does not enable the subscriber. Shows a safe expired-link page.

Tampered or invalid link
  Shows a safe generic failure page and does not reveal whether the subscriber exists.

Deleted subscriber
  Shows a safe "subscription can no longer be confirmed" page.
```

## Platform Alignment

- Reuse the signed-token pattern from unsubscribe/email action links.
- Keep sending isolated in the email sender module.
- Keep subscriber state in `subscribers.config_json` for MVP; no schema change unless implementation proves a durable query need.
- Use `enabled = 0` to prevent pending subscribers from receiving deliveries.
- Audit confirmation success, expiry, invalid token, and already-confirmed outcomes.

## Acceptance Criteria

- `authorization.required` is opt-in and not default.
- Pending authorized subscribers are not selected for alert delivery.
- Confirmation enables only the intended email subscriber.
- Expired/invalid/month-old links fail closed.
- Public response pages are safe, simple, and do not leak subscriber existence.
- Existing email subscribers without authorization config behave exactly as today.

## Test Plan

- Unit tests for authorization config parsing and default behavior.
- Unit tests for token signing, verification, expiry, tamper detection, and key rotation.
- Integration tests for:
  - create pending email subscriber,
  - confirmation enables subscriber,
  - already-confirmed click is idempotent,
  - expired token does not enable subscriber,
  - invalid token does not reveal resource details.
- Delivery regression test proving pending subscribers do not receive alerts.
- Run `npm run check` from `apps/headsupp-api`.

## API Documentation

- Update `docs/api/email-subscribers.md` with optional authorization setup.
- Update `docs/api/reference.md` with config fields and public confirmation endpoint.
- Update SDK docs/readmes with an authorization-required example.
- Update `docs/operations-runbook.md` with confirmation-link troubleshooting.

## Done Definition

- Email subscriber authorization is production-safe, opt-in, auditable, and documented.
- No real recipient emails, tokens, or secrets are committed.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep modules small, update API docs with endpoint/config changes, preserve tenant boundaries, and run focused tests plus `npm run check`.
- Do not force authorization through CFKit DataModel on the event hot path.

## Status

Done.
