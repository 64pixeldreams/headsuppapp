# Auth Service Account And Permissions_done

## User Story

As the Heads Up API, I want to recognize Foretic service-account permissions, so that Foretic can provision resources without becoming the tenant boundary.

## Scope

- Add small pure permission helpers.
- Define the Foretic service permission set.
- Add a CFKit CloudFunction that can inspect current auth permissions for debugging.
- Keep service-account auth separate from connector HMAC ingest auth.

## Out Of Scope

- Creating users in production.
- Creating or storing API keys.
- Building workspace/channel models.
- Building Foretic provisioning endpoints.

## Acceptance Criteria

- Given an auth context with `foretic:provision`, when permission is checked, then access is allowed.
- Given an auth context without `foretic:provision`, when permission is checked, then access is rejected.
- Given missing auth, when permission is checked, then access is rejected.
- Given the CFKit `headsupp.authContext` function, when called with valid auth, then it returns a sanitized auth summary and logs.

## Test Plan

- Unit test permission helper for valid, invalid, and missing auth.
- Unit test permission helper supports all required permissions.
- Integration test `headsupp.authContext` requires auth.
- Run `npm test`.

## API Documentation

- Update `docs/api/authentication.md` with service-account permission rules.

## Implementation Notes

- Add small modules under `apps/headsupp-api/src/services/auth`.
- Register a small CFKit function in `src/functions/register-headsupp-functions.js`.
- Do not expose API key values or secrets in responses.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
