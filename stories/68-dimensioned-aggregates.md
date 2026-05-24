# Dimensioned Aggregates

## User Story

As a user, I need aggregates and watch evaluation to remain separated per dimension set so different forecast IDs or entities do not collapse into one bucket.

## Scope

- Add dimension identity to aggregate model (`dimensions_hash`, `dimensions_json`).
- Update fold key logic to include dimensions.
- Update D1 aggregate uniqueness/indexing for dimension-aware rows.
- Update watch invocation and aggregate reads to support dimension scope.

## Acceptance Criteria

- Same signal/bucket with different dimensions creates distinct aggregate rows.
- Watch evaluation can target the correct dimensioned row(s).
- Aggregate-forward payload identity reflects dimensioned aggregate source.

## Test Plan

- Unit tests for fold keys and hashes.
- SQL upsert/index tests.
- Integration test with two dimensions sharing signal key.
- Run `npm run check` and `npm run load:smoke`.

## API Documentation

- Update `docs/api/schema-and-migrations.md`.
- Update `docs/api/aggregate-forwarding.md`.
- Update `docs/api/reference.md`.

## Done Definition

- Dimension-aware aggregation works end-to-end.
- Migrations/backfill documented.
- Tests green.

## Status

Pending.
