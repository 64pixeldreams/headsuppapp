# Smoke Test Suite Index_done

## User Story

As a maintainer, I want a documented smoke-test suite index, so we know which deployed proofs exist, what each one proves, and which command to run before declaring the API healthy.

## Scope

- Create a single smoke-test matrix covering all deployed proof scripts.
- Group tests by product principle: ingest fast, aggregation-first, silence by default, delivery reliability, scheduled intelligence, tenant isolation.
- Include command names, required runtime environment variables, expected D1 changes, expected Slack/webhook messages, and cleanup behaviour.
- Define the minimum smoke set required before a release/deploy.

## Out Of Scope

- Implementing all individual smoke tests in this story.
- CI integration.
- Long-running soak tests.

## Acceptance Criteria

- The smoke matrix lists every available smoke command.
- The matrix identifies missing smoke coverage.
- Each smoke test has a clear pass/fail signal.
- The release checklist says which smokes must pass before deploy is considered proven.

## Test Plan

- Documentation-only unless scripts are wired.
- Run `npm run check` if package scripts or code are changed.
- Secret scan docs for real URLs/tokens.

## API Documentation

- Update `docs/final-smoke-runbook.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.

## Implementation Notes

- Keep this as the coordination story after stories 50-56.
- Use the generic Slack smoke result as the first completed row.

## Done Definition

- Smoke matrix documented.
- Missing coverage is explicit.
- Docs contain no real secrets.

## Status

Done.
