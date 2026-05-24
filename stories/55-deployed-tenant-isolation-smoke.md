# Deployed Tenant Isolation Smoke_done

## User Story

As a platform owner, I want a deployed smoke test for tenant isolation, so two workspaces/channels can ingest similar signals without leaking aggregates, alerts, or deliveries across tenant boundaries.

## Scope

- Provision two generic workspaces with different ownership fields.
- Provision separate channels, connectors, signals, watches, and subscribers.
- Send similar `signal_key` events to both connectors.
- Trigger only one tenant's watch.
- Verify aggregates and alerts are scoped to the correct workspace/channel.
- Verify only the intended subscriber receives a delivery.

## Out Of Scope

- Full auth/session tenant model.
- Cross-account Cloudflare isolation.
- UI-level permissions.

## Acceptance Criteria

- Tenant A and Tenant B can use the same `signal_key` safely.
- Tenant A events do not update Tenant B aggregates.
- Tenant B events do not update Tenant A aggregates.
- Triggering Tenant A watch does not notify Tenant B subscriber.
- Observability/proof output reports per-workspace counts without payload secrets.

## Test Plan

- Add unit test coverage for any isolation helper changes.
- Add deployed smoke command, for example `npm run smoke:tenant-isolation`.
- Assert D1 aggregates, alerts, and deliveries by workspace/channel.
- Run `npm run check`.

## API Documentation

- Update `docs/api/authentication.md`.
- Update `docs/api/spec-fit-and-proof-tests.md`.
- Update `docs/final-smoke-runbook.md`.

## Implementation Notes

- Use deterministic smoke tenant IDs.
- Keep Slack optional; D1 delivery assertions may be enough for tenant proof.
- Do not print subscriber destination URLs.

## Done Definition

- Deployed tenant isolation smoke passes.
- Docs updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
