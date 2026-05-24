# Advanced Trend Watch Types

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

## Status

Pending.
