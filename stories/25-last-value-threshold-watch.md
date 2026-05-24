# Last Value Threshold Watch_done

## Spec Check

`SPEC_BREIF.md` defines `LAST_VALUE_LT` for Foretic pace and `LAST_VALUE_GT` for current metric limits. Rules evaluate aggregates, not raw events.

## Scope

- Evaluate last-value threshold watches against aggregate `last_value`.
- Support direct watch fields and `config_json`.
- Return current value, threshold, severity, and triggered state.

## Out Of Scope

- Cooldown, persistence, and delivery are handled in later stories in this batch.

## Test Plan

- Unit test `LAST_VALUE_LT`.
- Unit test `LAST_VALUE_GT`.
- Unit test non-triggered values.

## Status

Done.
