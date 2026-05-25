# 73 Outbound Webhook Signing_done

## User Story

As a subscriber system owner, I need signed outbound webhook deliveries so I can verify authenticity and replay-protect inbound callbacks from Heads Up.

## Scope

- Add outbound signature headers:
  - `X-HeadsUp-Timestamp`
  - `X-HeadsUp-Signature`
  - `X-HeadsUp-Delivery-Id`
- Sign over timestamp + raw body using per-subscriber secret or configured signing key.

## Acceptance Criteria

- Generic and aggregate-forward webhook deliveries include signature headers.
- Signature verification can be reproduced in tests.
- Header signing does not expose secrets.

## Test Plan

- Unit tests for outbound signing helper.
- Delivery tests asserting headers and signature stability.
- Run `npm run check`.

## API Documentation

- Update `docs/api/subscribers.md`.
- Update `docs/api/reference.md`.

## Done Definition

- Outbound signing active and documented.
- Tests green.

## Status

Done. Generic and aggregate-forward webhook delivery paths include timestamp, signature, and delivery-id headers when signing is configured, with signing helper tests and subscriber docs.
