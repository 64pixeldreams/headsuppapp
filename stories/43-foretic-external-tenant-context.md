# Foretic External Tenant Context_done

## User Story

As the Heads Up API, I want to normalize Foretic external ownership context, so that today's user-only Foretic SaaS model can later upgrade to tenant/account ownership without data migration pain.

## Scope

- Add a pure Foretic tenant-context normalization module.
- For the current Foretic integration, derive `external_tenant_id` from Foretic `user_id` when no tenant exists.
- Preserve explicit `external_user_id`.
- Produce stable workspace and forecast channel keys.
- Add tests using the real Foretic fixture.

## Out Of Scope

- Creating workspaces or channels.
- Calling Foretic.
- Persisting models.
- Migrating Foretic to real tenants.

## Acceptance Criteria

- Given `user_id = user:mkfoxvxgoyfbtd`, when Foretic context is normalized, then `external_tenant_id` defaults to that user id.
- Given `forecast_id = oracle_forecast:mlfl1bfqrxnbk1`, when forecast channel key is generated, then it is stable and scoped to the Foretic user/tenant.
- Given a future explicit `external_tenant_id`, when context is normalized, then it is preserved.
- Given missing user identity, when context is normalized, then validation fails.
- Given client-provided `user_id`, when context is normalized, then it is treated only as Foretic external identity, not Heads Up auth ownership.

## Test Plan

- Unit test current Foretic user-only fixture.
- Unit test future tenant/account fixture.
- Unit test missing external user fails.
- Unit test workspace key and forecast channel key generation.
- Run `npm test`.

## API Documentation

- Update `docs/api/foretic-provisioning.md`.
- Document current rule: `external_tenant_id = Foretic user_id` until Foretic has tenants.

## Implementation Notes

- Add small module under `apps/headsupp-api/src/services/foretic`.
- Do not store or infer Heads Up `user_id` here.
- Use `source_app = "foretic"` consistently.

## Done Definition

- Code implemented.
- Tests added.
- API docs updated.
- `npm test` passes.
- No unrelated changes.

## Status

Done.
