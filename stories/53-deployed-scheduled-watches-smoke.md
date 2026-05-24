# Deployed Scheduled Watches Smoke_done

## User Story

As a maintainer, I want deployed smoke tests for scheduled watch behaviour, so `MISSING_EXPECTED`, `DIGEST`, and `AGGREGATE_FORWARD` are proven through Cloudflare Cron-compatible execution rather than only unit tests.

## Scope

- Add smoke coverage for `MISSING_EXPECTED`.
- Add smoke coverage for `DIGEST`.
- Add smoke coverage for `AGGREGATE_FORWARD`.
- Allow smoke scripts to invoke scheduled task logic in a controlled way or wait for cron where appropriate.
- Verify alert deliveries and aggregate deliveries in D1.
- Verify aggregate-forward payloads include `delivery_id` and `dedupe_key`.

## Out Of Scope

- Full scheduler UI.
- Long-running soak tests.
- Email or Slack OAuth.

## Acceptance Criteria

- Missing expected smoke creates one absence alert when expected events are missing.
- Digest smoke creates one digest alert when due and updates digest state.
- Aggregate-forward smoke creates one aggregate delivery for a closed bucket.
- Re-running aggregate-forward smoke does not duplicate the same closed-bucket delivery.
- Raw input events are not forwarded back as raw payloads.

## Test Plan

- Add or extend unit tests for any scheduler helper changes.
- Add deployed smoke command, for example `npm run smoke:scheduled`.
- Assert D1 state for alerts, watch states, aggregate deliveries, and delivery payloads.
- Optionally use a generic webhook test receiver for aggregate-forward verification.
- Run `npm run check`.

## API Documentation

- Update `docs/api/aggregate-forwarding.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.
- Update `docs/final-smoke-runbook.md`.

## Implementation Notes

- Prefer deterministic smoke bucket timestamps.
- Keep cron-dependent tests bounded with polling timeouts.
- Avoid sleeping longer than necessary; use direct scheduled task invocation if a safe operator endpoint/script exists.

## Done Definition

- Deployed scheduled smoke passes.
- Docs updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
