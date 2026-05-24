# Cooldown And Alert Suppression_done

## Spec Check

`SPEC_BREIF.md` and the product brief both require silence by default: once a watch fires, repeated alerts are suppressed until cooldown expires unless escalation, recovery, digest, or allowed window behavior applies.

## Scope

- Calculate cooldown decisions from `watch_state`.
- Suppress repeated same-severity alerts during cooldown.
- Allow first alerts and post-cooldown alerts.

## Test Plan

- Unit test first alert.
- Unit test same-severity cooldown suppression.
- Unit test post-cooldown alert.

## Status

Done.
