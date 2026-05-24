# Workspace Ownership And Tenant Isolation_done

## User Story

As the Heads Up API, I want reusable tenant ownership checks, so Foretic user-owned resources cannot cross-read or cross-write each other.

## Scope

- Add small ownership helper functions.
- Compare resources against `source_app`, `external_tenant_id`, and `workspace_id`.
- Validate channel/subscriber workspace relationships.
- Keep this independent from persistence.

## Out Of Scope

- Creating workspaces or channels.
- Database schema creation.
- Full authorization middleware.

## Acceptance Criteria

- Given a resource with matching Foretic tenant context, access is allowed.
- Given a resource from another Foretic user/tenant, access is rejected.
- Given a channel from another workspace, subscriber creation checks reject it.
- Given a missing resource, ownership checks return a useful not-found result.

## Test Plan

- Unit test tenant ownership match.
- Unit test tenant ownership mismatch.
- Unit test missing resource.
- Unit test workspace relationship validation.
- Run `npm test`.

## API Documentation

- Update `docs/api/authentication.md`.
- Update `docs/api/foretic-provisioning.md`.

## Implementation Notes

- Add `src/services/ownership/tenant-scope.js`.
- Do not rely on channel names for security.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
