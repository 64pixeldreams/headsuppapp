# Email Normalization Pipeline Stub

## User Story

As an integrator, I need a dedicated email-to-signal normalization pipeline contract so inbound email can evolve independently from webhook/API ingestion.

## Scope

- Define queued email normalization job shape.
- Implement parser interface boundaries for:
  - MIME/text/html extraction
  - link/CTA candidate extraction
  - attachment policy hooks
- Add fallback path for unparseable emails into failure queue/state.

## Acceptance Criteria

- Email pipeline has clear input/output contracts.
- Unparseable emails are stored in explicit failure state.
- No AI dependency required in this story.

## Test Plan

- Unit tests for pipeline contract and failure routing.
- Integration test for stub parser -> normalized placeholder event.
- Run `npm run check`.

## API Documentation

- Update `docs/api/connectors-and-ingest.md`.
- Update `docs/operations-runbook.md`.

## Done Definition

- Email normalization pipeline skeleton is in place for later parser/AI work.

## Status

Pending.
