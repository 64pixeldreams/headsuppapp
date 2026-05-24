# Foretic Provision Workspace_done

## User Story

As Foretic, I want to provision or fetch a Heads Up workspace for a Foretic user, so that future channels, connectors, watches, and subscribers have a stable ownership container.

## Scope

- Add a small control-plane key/value store abstraction.
- Add Foretic workspace provisioning service.
- Register `foretic.provisionWorkspace` as a CFKit CloudFunction.
- Make provisioning idempotent by `source_app + external_tenant_id`.

## Out Of Scope

- Full workspace CRUD.
- D1 schema.
- Channel creation.
- Subscriber creation.

## Acceptance Criteria

- Given a service auth with `foretic:provision`, provisioning creates a workspace.
- Given the same Foretic user/tenant, provisioning returns the same workspace.
- Given another Foretic user/tenant, provisioning creates a separate workspace.
- Given missing `foretic:provision`, provisioning is rejected.
- Given current Foretic user-only model, `external_tenant_id` is derived from Foretic user id.

## Test Plan

- Unit test workspace creation.
- Unit test idempotent re-provisioning.
- Unit test separate tenants create separate workspaces.
- Unit test permission rejection.
- Run `npm test`.

## API Documentation

- Update `docs/api/foretic-provisioning.md`.

## Implementation Notes

- Use `HEADSUPP_CACHE` in Cloudflare for this early control-plane store.
- Keep store implementation isolated behind a small module.
- Do not expose secrets.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
