# Idempotency Processed State

## User Story

As a reliability owner, I need idempotency to avoid both duplicates and event loss under partial failures.

## Scope

- Replace pre-completion dedupe semantics with safe processed-state or equivalent transactional flow.
- Ensure retries after partial failures do not silently drop valid work.
- Define behavior for mixed-success queue batches.

## Acceptance Criteria

- Duplicate events still do not double-count.
- Failed aggregate step does not permanently drop event on retry.
- Processing state transitions are explicit and testable.

## Test Plan

- Unit tests for dedupe state transitions.
- Integration test for partial failure then retry recovery.
- Run:
  - `npm run check`
  - `npm run load:smoke`

## API Documentation

- Update `docs/api/spec-fit-and-proof-tests.md`.
- Update `docs/operations-runbook.md`.

## Done Definition

- Idempotency is safe under retries and partial failures.
- Deployed duplicate-idempotency proof added.

## Status

Pending.
