# Quiet Status Summary Delivery

## User Story

As an operator, I need explicit quiet summaries so silence is visible proof of evaluation, not uncertainty.

## Scope

- Add periodic quiet summary generation job.
- Include per-channel/watch last-evaluated metadata.
- Deliver summaries through subscriber-capable channels (starting with webhook/slack format).

## Acceptance Criteria

- Quiet summary contains watched scope and last-evaluated timestamps.
- Summary can be scheduled and delivered without triggering normal alerts.
- Output is safe and tenant-scoped.

## Test Plan

- Unit tests for summary payload generation.
- Integration tests for scheduled emission cadence.
- Run `npm run check`.

## API Documentation

- Update `docs/api/observability.md`.
- Update `docs/api/subscribers.md`.
- Update `docs/final-smoke-runbook.md`.

## Done Definition

- Quiet summaries are generated and deliverable.
- Operators can verify periodic “all quiet” health from runtime outputs.

## Status

Pending.
