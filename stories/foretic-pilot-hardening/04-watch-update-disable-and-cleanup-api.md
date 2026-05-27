# Watch Update Disable And Cleanup API

## User Story

As Foretic, I want to disable or delete a pace-alert watch permanently, so a user can turn off forecast alerts without relying only on temporary mute controls.

## Product Fit

This is lifecycle control for the existing watch engine. It is not a dashboard or watch builder.

## Scope

- Add one or both watch lifecycle actions:
  - `admin.updateWatch`
  - `admin.deleteWatch`
- Minimum viable `admin.updateWatch` fields:
  - `workspace_id`
  - `channel_id`
  - `watch_id`
  - `enabled`
  - optional `name`
  - optional `cooldown_seconds`
  - optional `config`
  - optional `escalation`
  - optional `recovery`
- If `admin.deleteWatch` is added, prefer soft delete or disabled state unless hard delete is clearly safe.
- Ensure disabled watches are ignored by evaluation (already true in evaluator; expose it through API).
- Preserve `admin.snoozeWatch` / `admin.muteWatch` as temporary controls.

## Out Of Scope

- Visual watch editor.
- Bulk watch updates.
- Migration of old muted rows into disabled watches.
- Deleting historical alerts.

## Acceptance Criteria

- `admin.updateWatch` with `enabled: false` disables future evaluation for that watch.
- `admin.updateWatch` with `enabled: true` re-enables the watch.
- `admin.getWatchState` remains readable after disable.
- Cross-tenant update is denied.
- Updating config persists valid JSON and does not break existing watch evaluation.
- Docs clearly distinguish:
  - snooze = temporary
  - mute = until resumed
  - disable = durable watch off
  - delete = only if implemented and documented

## Test Plan

- Unit tests for update watch enabled false/true.
- Integration test: trigger once, disable, send triggering event, verify no new alert.
- Tenant scope negative tests.
- SDK wrapper tests for update/disable/delete behavior if wrappers are added.
- Run `npm run check`.

## API Documentation

Main API docs:

- Update `docs/api/reference.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/watch-types.md` action controls section.
- Update `docs/api/foretic-pace-email-pilot.md` if already present, otherwise update story 06's pilot guide when created.

SDK docs:

- Update `docs/public-sdk/client-reference.md` with watch lifecycle wrappers/examples.
- Update `docs/public-sdk/cookbook/noise-control.md` or equivalent cookbook guidance to distinguish snooze, mute, disable, and delete.
- Update `packages/headsupp-client/README.md` and `headsuppclientsdk/docs/` equivalents when SDK docs change.

## Implementation Notes

- Relevant files:
  - `apps/headsupp-api/src/functions/admin-functions.js`
  - `apps/headsupp-api/src/services/admin/control-plane.js`
  - `packages/headsupp-client/src/client.js`
- Favor `admin.updateWatch` first; hard delete can be deferred if alert/watch-state references make deletion risky.
- Audit every update.

## Done Definition

- Durable disable/re-enable works through API.
- SDK wrapper added if public.
- Main API docs, SDK docs, and tests updated.
- `npm run check` passes.

## Status

Pending.
