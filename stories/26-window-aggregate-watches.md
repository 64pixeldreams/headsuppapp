# Window Aggregate Watches_done

## Spec Check

`SPEC_BREIF.md` defines `WINDOW_AVG_LT`, `WINDOW_AVG_GT`, `WINDOW_SUM_GT`, and `WINDOW_COUNT_GT` over aggregate windows. These use existing aggregate rows and do not inspect raw events.

## Scope

- Evaluate window aggregates from aggregate rows.
- Support sum, count, and average comparisons.
- Keep query/persistence separate from pure evaluation.

## Test Plan

- Unit test window average low/high.
- Unit test window sum threshold.
- Unit test window count threshold.

## Status

Done.
