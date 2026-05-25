# 76 Release Soak Test_done

## User Story

As a release owner, I need a bounded soak test so we can prove stability over sustained runtime load before declaring production readiness.

## Scope

- Add a longer-running soak command (beyond smoke) with bounded duration.
- Include ingest load, retries, cron activity, and observability checks.
- Produce machine-readable summary output.

## Acceptance Criteria

- Soak test runs to completion in a bounded window.
- Summary reports throughput, failures, retry backlog, and final health state.
- Soak can be run with runtime secrets only.

## Test Plan

- Local dry-run mode for CI-safe checks.
- Deployed soak runbook steps.
- Run `npm run check`.

## API Documentation

- Update `docs/api/smoke-test-suite.md`.
- Update `docs/final-smoke-runbook.md`.
- Update `docs/operations-runbook.md`.

## Done Definition

- Soak test command and docs added.
- Stable summary output available.

## Status

Done. `npm run soak:release` is implemented, documented in the smoke and final runbooks, and reports a machine-readable throughput/fold-compression summary.
