# CI Release Automation_done

## User Story

As a maintainer, I want repeatable CI and release commands, so every change can prove the API before deployment without relying on memory or manual command lists.

## Product Fit

The spec prioritizes correctness and proven Cloudflare behavior. CI should run local quality gates for every PR and make deployed smokes available for release verification without committing secrets.

## Scope

- Add a CI workflow for local checks:
  - install dependencies;
  - run `npm run check`;
  - run `npm run load:smoke`;
  - optionally validate docs links or generated OpenAPI artifacts if present.
- Add a release smoke workflow or script that can run selected deployed smokes when runtime secrets are supplied.
- Document which checks are required for PRs versus releases.
- Ensure CI never stores or prints real Slack webhooks, API keys, connector secrets, or Cloudflare tokens.

## Out Of Scope

- Automatically deploying to production without approval.
- Running Slack smokes on every pull request.
- Long-running soak tests.

## Acceptance Criteria

- PR/local CI can run without production secrets.
- Release smoke path is documented and can run with runtime secrets.
- CI fails if `npm run check` or `npm run load:smoke` fails.
- Deployed smokes are opt-in and secret-gated.
- Documentation explains how to run the same gates locally.

## Test Plan

- Run CI commands locally:
  - `npm run check`;
  - `npm run load:smoke`.
- If a workflow file is added, validate YAML syntax where practical.
- Secret scan workflow files and docs.

## API Documentation

- Update `docs/api/smoke-test-suite.md`.
- Update `docs/final-smoke-runbook.md`.
- Add or update a release checklist doc if useful.

## Implementation Notes

- Keep deployed smoke secrets as environment variables only.
- Use fake placeholders in workflow comments and docs.
- Consider separate jobs for local deterministic checks and deployed smoke checks.

## Done Definition

- CI/release automation files or scripts added.
- Release checklist documented.
- Local gates pass.
- No secrets committed.

## Status

Done.
