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

## Status

Pending.
