# Setup Assistant Contract-Draft Stub

## User Story

As a user, I want channel setup assistance from purpose text and sample events so I can start quickly without full manual contract wiring.

## Scope

- Add setup-assistant API stub that accepts:
  - channel purpose text
  - sample payload(s)
- Return draft channel contract suggestion object (no auto-apply by default).
- Add explicit review/approve workflow boundary.

## Acceptance Criteria

- Draft endpoint returns deterministic contract suggestions from sample inputs.
- No hidden side effects: draft generation does not create runtime resources.
- Optional “apply draft” remains separately authorized.

## Test Plan

- Unit tests for input validation and draft shaping.
- Integration test for draft -> approved apply handoff boundary.
- Run `npm run check`.

## API Documentation

- Update `docs/api/admin.md`.
- Update `docs/api/reference.md`.

## Done Definition

- Setup assistant entrypoint exists as a safe, review-first stub.
- Story is renamed with `_done` only after all Cursor rules and proof gates pass.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: use CFKit CloudFunctions for control-plane actions, keep draft generation side-effect free, and require explicit authorization for any apply step.
- Write focused tests for input validation, deterministic draft shaping, no-side-effect guarantees, and approved apply handoff.
- Run `npm run check` from `apps/headsupp-api`.
- Run `npm run load:smoke` if applying drafts can affect runtime watch/signal defaults.
- Update API docs and confirm no secrets, real user samples, or private payloads are committed.

## Status

Pending.
