# Escalation And Recovery Alerts_done

## Spec Check

`SPEC_BREIF.md` allows alerts during cooldown only when severity increases and supports optional recovery alerts when a configured recovery condition is met. The product brief gives the Foretic flow: warning, critical escalation, silence, then recovery.

## Scope

- Compare severity rank for escalation decisions.
- Evaluate simple recovery conditions such as `value >= 95`.
- Return decision type: `alert`, `escalation`, `recovery`, or `none`.

## Test Plan

- Unit test warning-to-critical escalation during cooldown.
- Unit test same critical stays silent.
- Unit test recovery alert from triggered state.

## Status

Done.
