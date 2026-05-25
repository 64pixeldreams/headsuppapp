# Unsubscribe Token Security And UX

## Scope

- Signed + expiring unsubscribe tokens with key rotation support.
- Public unsubscribe endpoint with brute-force safe behavior.
- Idempotent disable flow and audit log entries.

## Acceptance

- Valid token disables subscriber.
- Invalid/expired/tampered token returns safe generic response.
- Audit log records success/failure outcomes.

## Status

Done (token signing, expiry, endpoint UX, audit logging implemented).
