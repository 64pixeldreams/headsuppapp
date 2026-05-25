# Recurring Expectations v2

## User Story

As a finance/revenue operator, I need richer “expected event” contracts so absence detection can represent real-world recurring commitments.

## Scope

- Extend missing-expected model to support:
  - expected source/payer identity
  - expected amount range
  - cadence and due window
  - grace period
  - optional skip/snooze window
- Track fulfilled/not-fulfilled state per expectation cycle.

## Acceptance Criteria

- Expectations can specify due windows and amount ranges.
- Missing-expected alerts only fire when expectation is unresolved after grace.
- Fulfilled state prevents duplicate absence alerts in same cycle.

## Test Plan

- Unit tests for expectation-matching logic.
- Integration tests for due->fulfilled->next-cycle behavior.
- Run `npm run check`.

## API Documentation

- Update `docs/api/reference.md`.
- Update `docs/operations-runbook.md`.

## Done Definition

- Recurring expectation semantics are robust enough for payment-arrival style use cases.
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: implement absence detection through scheduled evaluation, not ingest, and keep expectation matching tenant-scoped.
- Write focused tests for due windows, amount ranges, fulfilled cycles, grace periods, and skip/snooze interactions.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run smoke:scheduled` because this changes scheduled absence behavior.
- Run `npm run smoke:tenant-isolation` if expectation matching reads tenant-scoped aggregates/events.
- Update API docs/runbooks and confirm no secrets are committed.

## Status

Partially complete through story 99: `MISSING_EXPECTED` now supports explicit due windows, dimensions, grace, and expected value ranges while preserving the old count-in-window shape. Per-cycle fulfilled state and skip/snooze windows remain pending.
