# Alert And Watch-State Read API

## User Story

As an operator, I need read APIs for alerts and watch state so quiet operation remains auditable and never opaque.

## Scope

- Add read endpoints/actions for:
  - channel alerts list
  - watch state
  - recent alert timeline
  - suppressed count metadata (if derivable)
- Enforce tenant and permission guards.
- Keep response payloads safe (no secrets/destinations).

## Acceptance Criteria

- Authorized callers can list alerts and watch state per channel/watch.
- Unauthorized access returns scoped auth errors.
- Read responses include timestamps needed for trust in silence.

## Test Plan

- Unit tests for query shaping and auth guards.
- Integration tests for tenant isolation.
- Run `npm run check`.

## API Documentation

- Add/expand `docs/api/alerts-and-deliveries.md` (or reference section).
- Update `docs/api/reference.md`.

## Done Definition

- Alert/watch-state read APIs are available and documented.
- Scope/auth behavior is covered by tests.

## Status

Pending.
