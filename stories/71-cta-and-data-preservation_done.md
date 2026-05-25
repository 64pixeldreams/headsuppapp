# 71 CTA And Data Preservation_done

## User Story

As an alert consumer, I need actionable CTA and context data in alerts so notifications can drive immediate action.

## Scope

- Preserve event CTA through aggregate/watch evaluation to alert rows.
- Preserve relevant event fields/data in alert payloads.
- Ensure generic and Slack payload generation uses preserved fields safely.

## Acceptance Criteria

- Incoming CTA appears in alert persistence and outbound payloads.
- Context fields are present in generic webhook payloads.
- No secrets are leaked through payload enrichment.

## Test Plan

- Unit tests for alert payload building with CTA/data.
- Integration test ingest -> watch -> delivery preserving CTA.
- Run `npm run check`.

## API Documentation

- Update `docs/api/subscribers.md`.
- Update `docs/api/reference.md`.

## Done Definition

- CTA and context flow is end-to-end.
- Tests and smokes pass.

## Status

Done. CTA, fields, and safe event context are preserved into alerts and aggregate-forward payloads, with docs/tests covered by `npm run check` and deployed smoke payload assertions.
