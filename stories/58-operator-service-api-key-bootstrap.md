# Operator Service API Key Bootstrap_done

## User Story

As a Heads Up operator, I want a first-class bootstrap path for creating service API keys, so production setup does not require manual D1/KV edits or ad hoc smoke harness seeding.

## Product Fit

This supports the spec's API-only control plane while keeping the hot ingest path Cloudflare-native and asynchronous. It does not add login UI, billing, Slack OAuth, dashboards, or per-event alerting.

## Scope

- Add an operator bootstrap command or tightly-scoped CloudFunction for creating a service API key.
- Store only hashed API key material.
- Return raw API key material only once at creation.
- Support permission sets needed by current admin actions:
  - `workspace:create`
  - `channel:create`
  - `connector:create`
  - `subscriber:create`
  - `signal:create`
  - `watch:create`
  - optional integration permission such as `foretic:provision`
- Add deterministic non-production test fixtures for API key creation.
- Ensure bootstrap output redacts secrets in logs and command output after the one-time display.

## Out Of Scope

- User login UI.
- Billing/admin dashboard.
- OAuth flows.
- Rotating all existing keys; that belongs to the auth hardening stories.

## Acceptance Criteria

- Operator can create a service API key without manually editing D1 or KV.
- API key is stored hashed; raw key is returned only once.
- Created key can call existing CFKit admin actions according to permissions.
- Missing or insufficient bootstrap authorization is rejected.
- No secret key material is written to repository files, docs, or test snapshots.

## Test Plan

- Unit test key generation, hashing, redaction, and one-time response shape.
- Integration test that a created service key can call at least one protected admin CloudFunction.
- Negative test for missing bootstrap authorization.
- Run `npm run check`.
- Secret scan for real key/token patterns.

## API Documentation

- Update `docs/api/authentication.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/reference.md`.
- Update `docs/api/quickstart.md` if operator setup steps change.

## Implementation Notes

- Prefer CFKit control-plane patterns for API key auth and CloudFunction logging.
- Keep the operator path separate from event ingest.
- Use fake example keys only in docs and tests.

## Done Definition

- Bootstrap path implemented and tested.
- Admin docs explain how to create and store a service API key.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
