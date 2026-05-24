# Production Error Handling And Runbooks_done

## User Story

As an engineer on call, I want clear production error handling and runbooks, so I can diagnose failed smokes, stuck retries, cron problems, D1 errors, and worker exceptions quickly.

## Product Fit

This supports the spec's correctness and Cloudflare-native operations. It documents how to keep the API reliable without adding out-of-scope dashboard or BI features.

## Scope

- Standardize error responses for production-facing API paths where gaps remain.
- Ensure CFKit/logging output gives enough request context without leaking secrets.
- Add runbook sections for:
  - failed deployed smoke;
  - queue backlog or consumer failure;
  - delivery retry buildup;
  - permanent delivery failures;
  - D1 migration/query failures;
  - cron not running;
  - worker exception spike.
- Add tests for any changed error response helpers.
- Add safe examples for operator commands and Cloudflare inspection steps.

## Out Of Scope

- Building an incident management system.
- Long-term log retention policy.
- Paid monitoring vendor setup.

## Acceptance Criteria

- API error responses use stable codes and safe messages where implementation changes are needed.
- Runbook tells an engineer what to check first for each major failure mode.
- Runbook includes what not to do, especially not committing tokens/webhooks or editing production D1 manually except as an explicit break-glass step.
- Tests cover changed error helpers.
- Docs link from the smoke suite and final smoke runbook.

## Test Plan

- Unit tests for any shared error helper changes.
- Run `npm run check`.
- Secret scan runbooks and examples.

## API Documentation

- Update `docs/api/reference.md` error sections.
- Update `docs/final-smoke-runbook.md`.
- Add or update an operations runbook under `docs/`.

## Implementation Notes

- Keep this focused on production readiness and diagnosis.
- Do not add product-facing dashboards.
- Prefer stable error codes over verbose internal stack traces in responses.

## Done Definition

- Production runbook added or updated.
- Error response behavior is documented and tested where changed.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
