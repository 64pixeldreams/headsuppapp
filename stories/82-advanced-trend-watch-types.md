# 82 Advanced Trend Watch Types_partial

## User Story

As a user, I need trend-oriented watch types beyond simple deltas so alerts represent meaningful change patterns.

## Scope

- Add deterministic trend watch types:
  - `PERCENT_CHANGE_GT`
  - `PERCENT_CHANGE_LT`
  - `WINDOW_VS_PREVIOUS_WINDOW_GT`
  - `WINDOW_VS_PREVIOUS_WINDOW_LT`
- Define missing-baseline behavior and safe defaults.

## Acceptance Criteria

- Trend watch types evaluate against aggregate history windows.
- No false trigger when baseline is missing/zero unless explicitly configured.
- Existing watch types remain unchanged.

## Test Plan

- Unit tests for each trend type edge case.
- Integration tests with synthetic aggregate sequences.
- Run `npm run check`.

## API Documentation

- Update `docs/api/reference.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Done Definition

- Trend watch types are supported, tested, and documented.
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: evaluate watches against aggregates/state only, never raw events, and keep evaluator changes focused.
- Write focused unit tests for each new watch type and edge case before/alongside implementation.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run load:smoke` because aggregate history behavior is involved.
- Run deployed watch proofs when credentials are available: `npm run smoke:generic-slack` and `npm run smoke:alert-decisions`.
- Update API docs and confirm no secrets are committed.

## Status

Partially complete through story 97: `PERCENT_CHANGE_GT`, `PERCENT_CHANGE_LT`, `PREVIOUS_PERIOD_RATIO_GT`, `PREVIOUS_PERIOD_RATIO_LT`, and `SPIKE_GT` are implemented, tested, and documented. `WINDOW_VS_PREVIOUS_WINDOW_GT` and `WINDOW_VS_PREVIOUS_WINDOW_LT` remain pending.
