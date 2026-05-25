# 79 Alert And Watch-State Read API_done

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
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: use CFKit CloudFunctions for read actions, keep responses safe, and enforce tenant boundaries with `source_app`, `external_tenant_id`, `external_user_id`, and `workspace_id`.
- Write focused unit tests for query shaping and integration tests for auth/tenant isolation.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run smoke:tenant-isolation` if read APIs are used in deployed proof paths.
- Create `docs/api/alerts-and-deliveries.md` or document the read APIs in `docs/api/reference.md`; do not leave docs ambiguous.
- Confirm no secrets or full subscriber destinations are returned or committed.

## Status

Done.
