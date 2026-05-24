# Admin API Resource Provisioning Flow_done

## User Story

As an engineer integrating with Heads Up, I want to create workspaces, channels, connectors, signals, watches, and subscribers through documented admin APIs, so I can provision a working event-to-alert or aggregate-forward flow without direct D1/KV seeding.

## Product Fit

This completes the current API product loop:

```text
workspace -> channel -> connector -> signal -> watch -> subscriber
event -> queue -> aggregate -> watch evaluation -> delivery
```

It keeps CFKit on the control plane and leaves high-volume ingest/aggregation on direct Cloudflare primitives.

## Scope

- Harden the existing `admin.create*` CloudFunctions into a complete provisioning flow.
- Ensure each created resource writes all required D1 rows.
- Ensure connector metadata is written to KV so ingest works immediately after provisioning.
- Return safe provisioning summaries:
  - IDs needed by callers.
  - Event URL.
  - One-time connector secret only on creation.
  - Redacted subscriber destination.
- Add idempotent behavior for repeated provisioning where safe.
- Add an operator smoke that provisions only through `/api/function`, not direct D1/KV writes.

## Out Of Scope

- Full tenant management UI.
- Foretic app changes.
- Direct changes to raw event queue processing unless a provisioning bug requires it.

## Acceptance Criteria

- A service API key can provision all required resources through `/api/function`.
- After API provisioning, a signed event can be ingested through the returned connector URL.
- The smoke harness no longer needs direct D1/KV seeding for the generic provisioning path.
- Subscriber URLs and connector secrets are never returned except where explicitly one-time.
- Ownership fields are present on every workspace-scoped resource.

## Test Plan

- Unit tests for each admin row builder and response sanitizer.
- Integration test for full API provisioning sequence.
- Deployed smoke command, for example `npm run smoke:admin-provisioning`, that:
  - creates resources through `/api/function`;
  - sends signed events;
  - verifies aggregate and alert/delivery rows.
- Run `npm run check`.

## API Documentation

- Update `docs/api/admin.md`.
- Update `docs/api/reference.md`.
- Update `docs/api/quickstart.md`.
- Update `docs/api/smoke-test-suite.md`.

## Implementation Notes

- Keep API examples generic, not Foretic-only.
- Use `source_app`, `external_tenant_id`, `external_user_id`, and `workspace_id` consistently.
- The smoke should use fake Slack/webhook URLs unless the user supplies a runtime webhook.

## Done Definition

- Full generic provisioning flow works through admin API only.
- Smoke passes locally or deployed as appropriate.
- Docs updated.
- `npm run check` passes.
- No real secrets committed.

## Status

Done.
