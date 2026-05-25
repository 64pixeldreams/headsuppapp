# 66 Foretic D1 Canonical Provisioning_partial

## User Story

As a platform operator, I need Foretic provisioning to create runtime resources in D1 so Foretic ingest, watch evaluation, and deliveries work through the same engine path as generic tenants.

## Scope

- Rework `foretic.createForecastWatch` to create runtime entities in D1:
  - workspace
  - channel
  - connector
  - signal
  - signal contract
  - watches
  - subscribers
- Keep KV usage only for connector-key lookup used by ingest auth.
- Add a safe backfill command for existing KV-only Foretic setups.

## Acceptance Criteria

- Foretic provisioning creates D1 rows required by aggregation/watch/delivery.
- Foretic connector key can ingest events immediately.
- Foretic-provisioned watches are discovered by D1 watch invocation.
- Foretic-provisioned subscribers receive D1-backed deliveries.

## Test Plan

- Unit tests for Foretic provisioning service writes.
- Integration test for end-to-end Foretic provision -> ingest -> alert.
- Run:
  - `npm run check`
  - `npm run smoke:foretic`

## API Documentation

- Update `docs/api/foretic-provisioning.md`.
- Update `docs/api/reference.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Done Definition

- Foretic path is D1-canonical.
- Backfill path documented.
- Tests and smoke green.

## Status

Partial. Foretic provisioning is D1-canonical for runtime workspaces, channels, connectors, signals, watches, and subscribers, and `npm run smoke:foretic` covers the Foretic-shaped loop. The safe backfill command for legacy KV-only setups and a live Foretic Worker proof remain future scope.
