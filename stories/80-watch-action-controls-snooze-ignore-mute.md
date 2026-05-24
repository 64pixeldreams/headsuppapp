# Watch Action Controls (Snooze / Ignore / Mute)

## User Story

As a human operator, I need to snooze, ignore, or mute noisy watch outcomes so attention control includes explicit feedback loops.

## Scope

- Add watch/alert action model for:
  - snooze until timestamp
  - ignore alert
  - mute watch/signal
  - resume watch/signal
- Integrate action state into decision path.
- Audit all manual actions.

## Acceptance Criteria

- Snoozed watches suppress alerts until expiry.
- Ignored alerts are tracked and not redelivered.
- Mute/resume state is durable and tenant-scoped.

## Test Plan

- Unit tests for decision gating by action state.
- Integration tests for action lifecycle and audit logs.
- Run `npm run check`.

## API Documentation

- Update `docs/api/reference.md`.
- Update `docs/operations-runbook.md`.

## Done Definition

- Action controls work end-to-end and are auditable.
- No regression in existing watch decision semantics.

## Status

Pending.
