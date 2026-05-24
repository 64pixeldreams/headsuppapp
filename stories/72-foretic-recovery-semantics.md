# Foretic Recovery Semantics

## User Story

As a Foretic user, I need recovery alerts to mean “a previously triggered bad condition recovered,” not a separate unrelated threshold trigger.

## Scope

- Update Foretic default watch definitions to use escalation + `recovery_json` semantics.
- Remove or rework standalone recovery watch pattern.

## Acceptance Criteria

- Recovery requires prior triggered state.
- Warning/critical/recovery sequence matches product brief examples.
- No spurious recovery alert without prior degradation.

## Test Plan

- Unit tests for Foretic default watch generation.
- Deployed Foretic smoke proving warning -> critical -> recovery semantics.
- Run `npm run check`.

## API Documentation

- Update `docs/api/foretic-provisioning.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Done Definition

- Foretic recovery semantics match brief.
- Tests and smoke pass.

## Status

Pending.
