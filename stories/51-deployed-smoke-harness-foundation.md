# Deployed Smoke Harness Foundation_done

## User Story

As a maintainer, I want a reusable deployed smoke-test harness, so each proof test can seed runtime state, send signed events, poll D1/observability, and cleanly report pass/fail without duplicating fragile script code.

## Scope

- Create shared smoke utilities under `apps/headsupp-api/test/smoke` or `apps/headsupp-api/scripts/smoke`.
- Centralize Cloudflare API calls for D1 queries and KV writes.
- Centralize signed event generation.
- Centralize polling for alerts, deliveries, aggregates, and observability counts.
- Redact Slack URLs, Cloudflare tokens, connector secrets, and API keys from output.
- Standardize deterministic smoke IDs and cleanup behaviour.

## Out Of Scope

- Full end-to-end test framework migration.
- External hosted test receiver unless needed by a later retry story.
- Storing secrets in repo files.

## Acceptance Criteria

- Existing generic Slack smoke can be refactored onto the shared harness.
- Smoke scripts can run against a configurable deployed base URL.
- Smoke scripts fail with clear reasons when queue processing or delivery stalls.
- Runtime secrets are accepted only via environment variables.
- Harness output is safe to paste into issue/chat summaries.

## Test Plan

- Unit test redaction helpers.
- Unit test signed event helper.
- Unit test polling timeout behaviour with fake query functions.
- Run `npm run check`.
- Run `npm run smoke:generic-slack` after refactor.

## API Documentation

- Update `docs/final-smoke-runbook.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Implementation Notes

- Keep scripts simple Node ESM.
- Avoid adding heavyweight test dependencies unless clearly justified.
- Use deterministic resource IDs prefixed with `smoke_`.

## Done Definition

- Shared smoke harness exists.
- Generic Slack smoke uses it.
- Tests/docs updated.
- `npm run check` passes.

## Status

Done.
