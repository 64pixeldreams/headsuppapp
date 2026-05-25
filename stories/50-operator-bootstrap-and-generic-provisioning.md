# Operator Bootstrap And Generic Provisioning_done

## User Story

As an operator or integrating engineer, I want to provision generic Heads Up workspaces, channels, connectors, signals, watches, and subscribers through supported APIs or scripts, so smoke tests and real integrations do not need direct D1/KV seeding.

## Scope

- Define a clean bootstrap path for the current operational API.
- Support provisioning generic resources without Foretic-specific assumptions.
- Ensure connector lookup state is written consistently to D1 and KV.
- Ensure connector secrets are returned only at creation time.
- Provide an operator-safe way to authenticate provisioning.
- Document when to use CFKit `/api/function` versus an operator script.

## Out Of Scope

- Dashboard UI.
- Self-serve signup.
- Billing.
- Slack OAuth.
- Email connector.

## Acceptance Criteria

- A generic workspace/channel/connector/signal/watch/subscriber can be created without direct manual D1/KV writes.
- The created connector can immediately accept signed events at `/v1/events/{connector_key}`.
- Slack webhook subscribers can be registered as runtime secrets without being logged or committed.
- Provisioning is idempotent enough for repeated smoke runs.
- The API or operator command returns a concise setup summary for later event sending.

## Test Plan

- Unit test generic provisioning helpers.
- Integration test generic provisioning creates all required D1 rows.
- Integration test connector lookup state is available for ingest auth.
- Smoke test: provision generic threshold watch, send signed event, receive Slack alert.
- Run `npm run check`.

## API Documentation

- Update `docs/api/quickstart.md`.
- Update `docs/api/admin.md`.
- Update `docs/api/connectors-and-ingest.md`.

## Implementation Notes

- Prefer CFKit for control-plane APIs.
- Keep hot ingest path on direct D1/KV/Queues.
- Do not expose connector secrets after initial creation.
- Do not commit real Slack URLs or API keys.

## Done Definition

- Code implemented.
- Tests added.
- Docs updated.
- Generic smoke no longer needs direct D1/KV seed logic.
- `npm run check` passes.

## Status

Done.
