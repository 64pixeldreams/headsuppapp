# 80 Watch Action Controls (Snooze / Ignore / Mute)_done

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
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep decision-state modules small, audit control-plane actions, and preserve tenant boundaries on every action.
- Write focused tests before/alongside implementation for snooze, ignore, mute, resume, and audit logging.
- Run `npm run check` from `apps/headsupp-api`.
- Run deployed alert decision proof when credentials are available: `npm run smoke:alert-decisions`.
- Run `npm run smoke:tenant-isolation` if action state can affect tenant-scoped watches.
- Update API docs and operations runbook in the same change; confirm no secrets are committed.

## Status

Done.
