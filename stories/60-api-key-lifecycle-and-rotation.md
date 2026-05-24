# API Key Lifecycle And Rotation_done

## User Story

As a production operator, I want API keys to have clear lifecycle controls, so service credentials can be listed safely, rotated, revoked, and audited without exposing secret material.

## Product Fit

This hardens the CFKit control plane while preserving the spec's connector-level HMAC model for ingest. Event producers still use connector secrets; API keys are for control-plane provisioning and operations.

## Scope

- Add API key metadata fields needed for lifecycle:
  - key id;
  - owner/service label;
  - permissions;
  - status;
  - created time;
  - last used time where practical;
  - revoked time;
  - rotated from key id where practical.
- Add control-plane actions for:
  - listing safe key metadata;
  - rotating a key;
  - revoking a key.
- Ensure raw key material cannot be recovered after creation.
- Add tests for revoked and rotated keys.

## Out Of Scope

- Human login UI.
- Email notifications for key rotation.
- Migrating external integrations automatically.

## Acceptance Criteria

- Operators can list API keys without seeing raw secret values.
- Rotated keys return new secret material once and keep old key metadata.
- Revoked keys can no longer call protected actions.
- Permission checks still work after rotation.
- Audit metadata is updated for lifecycle actions.

## Test Plan

- Unit tests for key status transitions.
- Unit tests for redacted list response.
- Integration tests:
  - active key succeeds;
  - revoked key fails;
  - rotated replacement key succeeds;
  - old rotated key behavior is explicit and tested.
- Run `npm run check`.
- Secret scan.

## API Documentation

- Update `docs/api/authentication.md`.
- Update `docs/api/reference.md`.
- Add or update an API key lifecycle section in `docs/api/admin.md`.

## Implementation Notes

- Prefer existing CFKit auth and logging hooks where possible.
- Do not log raw API key material.
- Keep status names simple, for example `active`, `revoked`, `rotated`.

## Done Definition

- Key lifecycle actions implemented and tested.
- Docs describe key creation, rotation, revocation, and safe listing.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
