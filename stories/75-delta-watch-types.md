# Delta Watch Types

## User Story

As a user, I need `DELTA_LT` and `DELTA_GT` watches so alerting can trigger on change, not only absolute values.

## Scope

- Implement `DELTA_LT` and `DELTA_GT` in watch evaluation runtime.
- Define lookback/previous-value behavior for missing baseline rows.

## Acceptance Criteria

- `DELTA_GT` triggers when change exceeds threshold.
- `DELTA_LT` triggers when negative change exceeds threshold.
- Unsupported watch errors removed for delta types.

## Test Plan

- Unit tests for delta evaluation edge cases.
- Integration tests on aggregate history windows.
- Run `npm run check`.

## API Documentation

- Update `docs/api/reference.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Done Definition

- Delta watches implemented and tested.
- Docs updated.

## Status

Pending.
