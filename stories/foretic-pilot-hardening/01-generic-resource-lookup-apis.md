# Generic Resource Lookup APIs

## User Story

As an integration server such as Foretic, I want to look up Heads Up resources by stable external keys, so I can recover from local linkage loss and avoid recreating duplicate control-plane resources.

## Product Fit

This strengthens the generic Heads Up admin API for all integrations. It avoids making Foretic depend on `foretic.*` provisioning and keeps Heads Up standalone.

## Scope

- Add tenant-scoped read actions for generic resources:
  - `admin.getWorkspace`
  - `admin.getSignal`
  - `admin.getWatch`
  - `admin.getConnector`
- Extend or complement `admin.getChannel` so callers can read by one of:
  - `workspace_id` + `channel_id`
  - `workspace_id` + `channel_key`
  - `workspace_id` + `external_resource_id`
- Lookup fields:
  - workspace: `workspace_id` or `workspace_key`
  - channel: `channel_id`, `channel_key`, or `external_resource_id` within workspace
  - signal: `signal_id` or `channel_id` + `signal_key`
  - watch: `watch_id`
  - connector: `connector_id` or `connector_key`
- Return safe public rows only.
- Never return connector secrets or raw subscriber destinations.
- Enforce existing tenant scope rules:
  - `source_app`
  - `external_tenant_id`
  - `workspace_id`

## Out Of Scope

- List/search endpoints beyond the targeted lookup keys.
- Raw event lookup or aggregate drill-down.
- Foretic-only lookup actions.
- Dashboard pages.

## Acceptance Criteria

- Given a workspace created with `workspace_key`, when an authorized caller invokes `admin.getWorkspace`, then the canonical workspace row is returned.
- Given a forecast channel with `external_resource_id`, when Foretic calls `admin.getChannel` with `workspace_id` + `external_resource_id`, then the channel is returned.
- Given a signal created for `forecast.revenue.pace`, when an authorized caller uses `channel_id` + `signal_key`, then the signal is returned.
- Connector lookup redacts `connector_secret`.
- Cross-tenant lookup returns `TENANT_SCOPE_MISMATCH` or not found without leaking existence.

## Test Plan

- Unit tests for each lookup action and each supported key.
- Negative tests for cross-tenant access.
- Regression test that connector secret is not returned.
- Integration test using workspace/channel/signal/watch/connector created by generic admin APIs.
- SDK wrapper tests if named client methods are added.
- Run `npm run check`.

## API Documentation

Main API docs:

- Update `docs/api/reference.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/authentication.md` if permission requirements are clarified.
- Add examples for Foretic recovery lookup in a new or existing Foretic integration doc.

SDK docs:

- Update `docs/public-sdk/client-reference.md` if wrappers are added.
- Update `docs/public-sdk/getting-started.md` or cookbook docs if recovery lookup is part of the supported integration path.
- Update `packages/headsupp-client/README.md` and `headsuppclientsdk/docs/` equivalents when SDK wrapper docs change.

## Implementation Notes

- Relevant files:
  - `apps/headsupp-api/src/functions/admin-functions.js`
  - `apps/headsupp-api/src/services/admin/control-plane.js`
  - `apps/headsupp-api/src/services/admin/read-models.js`
- Prefer small helper functions for tenant-safe row loading.
- Permissions should align with existing read permissions:
  - workspace/channel reads: `channel:read` or a new explicit read if already available locally
  - signal/watch reads: `watch:read`
  - connector reads: `channel:read` or `connector:create` only if no read permission exists yet; document the decision.

## Done Definition

- Generic lookup actions implemented.
- Tenant-scope tests pass.
- Main API docs and SDK docs include request/response examples where applicable.
- `npm run check` passes.

## Status

Pending.
