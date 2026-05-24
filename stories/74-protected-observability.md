# Protected Observability

## User Story

As a platform operator, I need observability endpoints protected by auth so operational state is not publicly exposed.

## Scope

- Require operator auth for `/api/v1/observability/overview`.
- Preserve safe response payload shape.
- Update runbooks and smoke scripts to pass auth where required.

## Acceptance Criteria

- Unauthenticated access is rejected.
- Authenticated operator access succeeds.
- Existing operational fields remain available to authorized callers.

## Test Plan

- Integration tests for auth required/allowed paths.
- Run `npm run check`.

## API Documentation

- Update `docs/api/observability.md`.
- Update `docs/api/reference.md`.
- Update `docs/final-smoke-runbook.md`.

## Done Definition

- Observability is protected and documented.
- CI/runbook flows updated.

## Status

Pending.
