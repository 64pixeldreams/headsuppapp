# Self-Serve Service API Keys

## User Story

As a signed-in Heads Up customer, I want to create, list, revoke, and rotate my own service API keys, so I can integrate using the SDK and admin API without operator involvement.

## Product Fit

Extends existing API key lifecycle (stories 58–60) from **operator-only** to **customer-owned**. The key format, hashing, permissions model, and admin API usage stay the same.

## Scope

- Add session-authenticated control-plane actions (names illustrative; align with existing naming):
  - `account.createServiceApiKey`
  - `account.listServiceApiKeys`
  - `account.revokeServiceApiKey`
  - `account.rotateServiceApiKey`
- Scope keys to the authenticated user and their workspace(s); deny cross-tenant access.
- Default permission profile for customer keys: `headsupp:admin` integration set from `docs/api/authentication.md` (workspace/channel/connector/subscriber/signal/watch/alert read/control) — **exclude** `api_key:manage`, `operator.*`, and `foretic:provision` unless explicitly granted.
- Return raw key **once** on create/rotate; list responses remain redacted (reuse `api-key-service` patterns).
- Wire audit logging for customer key lifecycle events.
- Ensure revoked/rotated keys fail admin calls with `PERMISSION_DENIED` or equivalent.

## Out Of Scope

- Connector secret self-serve (connector secrets remain one-time at `admin.createConnector`).
- API key creation without authentication.
- Customer access to bootstrap token or operator observability endpoints.
- Per-key custom permission editor UI (fixed profile is acceptable for MVP).

## Acceptance Criteria

- Signed-in user can create a key and use it against `admin.createChannel` (or quickstart flow) successfully.
- User A cannot list or revoke user B's keys.
- List never returns full secret material.
- Rotated key works; old key behavior matches story 60 rules.
- Operator bootstrap and operator key management remain unchanged.
- Audit rows exist for create/revoke/rotate.

## Test Plan

- Unit tests for ownership checks and permission profile defaults.
- Integration test: signup/session → create key → call `admin.createWorkspace` or use existing workspace → `admin.createChannel`.
- Negative tests: revoked key, missing session, cross-tenant revoke attempt.
- Run `npm run check`.
- Secret scan.

## API Documentation

- Update `docs/api/customer-accounts.md` with key lifecycle.
- Update `docs/api/getting-started-api-keys.md`:
  - customer path (signup → create key);
  - operator bootstrap path (clearly labeled internal).
- Update `docs/api/reference.md` and `docs/public-sdk/getting-started.md`.

## Implementation Notes

- Reuse `apps/headsupp-api/src/services/auth/api-key-service.js`; add `owner_user_id` / `account_id` linkage if not already present.
- KV/D1 storage remains hashed-only for secrets.
- Consider max active keys per account (e.g. 5) to prevent abuse; document limit.

## Done Definition

- Self-serve key lifecycle works end-to-end with tests.
- Docs distinguish customer vs operator key creation.
- Public SDK getting-started reflects customer flow.
- `npm run check` passes.

## Status

Pending.

## Depends On

03 (authenticated account).

## Blocks

05, 06.
