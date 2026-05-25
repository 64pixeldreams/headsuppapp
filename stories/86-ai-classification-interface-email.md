# AI Classification Interface (Email)

## User Story

As a platform owner, I need a pluggable AI classification interface for email normalization so extraction quality can improve without coupling runtime to one model/provider.

## Scope

- Define provider-agnostic classifier interface for:
  - event type
  - merchant/entity
  - amount/currency
  - direction
  - category
  - confidence
- Add deterministic no-AI fallback classifier.
- Persist classifier confidence and provenance fields.

## Acceptance Criteria

- Runtime can execute with fallback classifier only.
- AI provider can be attached through interface without changing ingest contracts.
- Low-confidence outputs route to review/failure state.

## Test Plan

- Unit tests for interface adapters and fallback behavior.
- Integration test for confidence-based routing.
- Run `npm run check`.

## API Documentation

- Update `docs/api/reference.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Done Definition

- AI classification integration seam exists and is test-covered.
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep AI/provider code behind a small interface, use deterministic fallback behavior, and avoid committing real provider keys or private email fixtures.
- Write focused tests for adapter contract, fallback classifier, confidence/provenance persistence, and low-confidence routing.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run load:smoke` to prove existing webhook/API processing is not regressed.
- Update API docs/spec proof notes and confirm no model credentials, tokens, or private payloads are committed.

## Status

Pending.
