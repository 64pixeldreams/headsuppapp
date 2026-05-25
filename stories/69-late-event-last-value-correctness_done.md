# 69 Late Event Last Value Correctness_done

## User Story

As an operator, I need late/out-of-order events to preserve the true latest value so threshold watches and status outputs are not corrupted.

## Scope

- Fix aggregate upsert SQL so `last_value` updates only when incoming `last_event_at` is newer/equal.
- Keep existing min/max/sum/count behavior unchanged.

## Acceptance Criteria

- Older events do not overwrite `last_value`.
- Newer events still update `last_value`.
- `last_event_at` remains monotonic.

## Test Plan

- Unit test with ordered and out-of-order batches.
- Integration test proving cross-batch behavior.
- Run `npm run check`.

## API Documentation

- Update `docs/api/spec-fit-and-proof-tests.md`.

## Done Definition

- SQL correctness fixed and tested.
- No regression in aggregate smoke tests.

## Status

Done. Aggregate upsert preserves the latest `last_value` by event time, with regression coverage in aggregate tests and release proof through `npm run check`.
