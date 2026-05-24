# Deployed Cooldown Recovery Escalation Smoke_done

## User Story

As an operator, I want deployed smoke tests for cooldown, escalation, and recovery, so we can prove Heads Up alerts once, suppresses repeat noise, allows meaningful escalation, and emits recovery only when configured.

## Scope

- Add a deployed smoke script for alert decision behaviour.
- Provision generic threshold watches using the generic provisioning path or smoke harness.
- Send triggering events inside and outside cooldown windows.
- Send escalation events with higher severity where configured.
- Send recovery events where recovery is configured.
- Verify D1 alert/watch state and Slack delivery counts.

## Out Of Scope

- Digest behaviour.
- Missing expected behaviour.
- Aggregate forwarding.

## Acceptance Criteria

- First trigger creates one Slack alert.
- Second trigger inside cooldown creates no additional Slack alert.
- Higher-severity trigger inside cooldown creates one escalation alert when configured.
- Recovery value creates one recovery alert when recovery is enabled.
- Repeated recovery values do not spam Slack.

## Test Plan

- Add unit coverage for any helper changes.
- Add deployed smoke command, for example `npm run smoke:alert-decisions`.
- Run smoke against deployed Worker with runtime Slack webhook.
- Assert D1 alert count and delivery count match expectations.
- Run `npm run check`.

## API Documentation

- Update `docs/api/spec-fit-and-proof-tests.md`.
- Update `docs/final-smoke-runbook.md`.

## Implementation Notes

- Use short cooldowns for smoke resources.
- Keep event values easy to reason about, e.g. `5`, `15`, `25`.
- Print expected Slack messages and actual delivery counts.

## Done Definition

- Deployed smoke proves cooldown, escalation, and recovery.
- Docs updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
