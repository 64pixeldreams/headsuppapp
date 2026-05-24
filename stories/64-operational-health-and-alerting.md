# Operational Health And Alerting_done

## User Story

As a production operator, I want operational health checks and alerts for queue failures, retries, failed deliveries, D1 errors, cron failures, and worker exceptions, so the API can be trusted after deployment.

## Product Fit

Heads Up must stay silent for product users unless watches trigger, but the platform itself needs operator visibility. This story adds operational monitoring without turning Heads Up into a dashboard or BI product.

## Scope

- Define operational signals for:
  - raw queue processing failures;
  - alert delivery queue failures;
  - aggregate delivery queue failures;
  - retry backlog;
  - failed delivery count;
  - D1 write/query errors;
  - scheduled cron failures;
  - Worker unhandled exceptions.
- Add a safe operational status endpoint or extend observability with operator-safe counts.
- Add threshold rules for operator alerts, preferably using generic webhook/Slack subscriber configuration supplied at runtime.
- Add tests for health summary calculation and redaction.

## Out Of Scope

- Building a visual monitoring dashboard.
- Vendor-specific monitoring integration unless kept small and optional.
- Alerting end users about platform internals.

## Acceptance Criteria

- Operators can see retrying and failed delivery counts.
- Operators can identify whether scheduled tasks last ran successfully.
- D1/queue/worker error counters or recent failure states are exposed safely.
- Operational alert destinations are configured with runtime secrets only.
- Observability responses do not include raw event payloads, connector secrets, API keys, or full webhook URLs.

## Test Plan

- Unit tests for operational summary calculation.
- Unit tests for redaction of destinations and error metadata.
- Integration tests for observability endpoint response shape.
- Optional smoke that seeds failed/retrying deliveries and verifies operator status output.
- Run `npm run check`.

## API Documentation

- Update `docs/api/observability.md`.
- Update `docs/api/reference.md`.
- Update `docs/final-smoke-runbook.md`.
- Update `docs/api/smoke-test-suite.md` if a new smoke is added.

## Implementation Notes

- Keep monitoring reads lightweight and bounded.
- Do not add long-running work to ingest requests.
- Prefer D1 counts and small status rows over raw log scans.

## Done Definition

- Operational health summary implemented and tested.
- Monitoring docs and runbook updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
