# Channel Contract Model

## User Story

As an operator, I need each channel to declare its intent and expected signal shape so Heads Up can apply consistent defaults without per-signal manual setup.

## Scope

- Add `channel_contracts` runtime model in D1.
- Define contract fields for:
  - `purpose`
  - `expected_signal_types`
  - `default_dimensions`
  - `default_watch_templates`
  - `cta_policy`
  - `version`
- Add admin create/update/read actions for channel contracts.

## Acceptance Criteria

- A channel can have one active contract version.
- Contract reads are tenant-scoped and auditable.
- Contract updates create version history.

## Test Plan

- Unit tests for contract validation/versioning.
- Integration tests for tenant scoping and lifecycle.
- Run `npm run check`.

## API Documentation

- Update `docs/api/admin.md`.
- Update `docs/api/reference.md`.
- Update `docs/api/schema-and-migrations.md`.

## Done Definition

- Channel contracts are persisted and addressable by API.
- Versioning and scope checks are proven by tests.

## Status

Pending.
