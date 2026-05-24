# Observability Read Endpoints_done

## Spec Check

The product brief says Heads Up is not a dashboard, but the build docs require debugging support. This story adds read-only API endpoints for operational state without creating UI/BI behavior.

## Scope

- Add `/api/v1/observability/overview`.
- Return counts for pending/retrying/failed deliveries and active watches.
- Do not expose secrets, webhook URLs, or raw payload bodies.

## Test Plan

- Unit test overview query mapping.
- Integration test endpoint response.

## Status

Done.
