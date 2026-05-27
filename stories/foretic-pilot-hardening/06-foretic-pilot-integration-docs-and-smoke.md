# Foretic Pilot Integration Docs And Smoke

## User Story

As the Foretic team, I want a single tested integration guide for forecast pace email alerts, so the pilot can be implemented without relying on chat notes.

## Product Fit

This story documents the generic Heads Up API path for Foretic's first email-first pilot. It should reinforce that Heads Up is standalone and that Foretic owns the forecast UI and pace calculation.

## Scope

- Add a canonical doc, for example:
  - `docs/api/foretic-pace-email-pilot.md`
- Cover:
  - service API key permissions;
  - required env vars;
  - provisioning order;
  - stable key/id strategy;
  - required IDs/secrets Foretic must persist;
  - event payload contract;
  - email subscriber creation;
  - confirmation behavior;
  - pause/resume/disable controls;
  - read/status calls;
  - test strategy.
- Add or update a smoke script that proves the email-first pace path using generic `admin.*` actions:
  - create workspace/channel/connector/signal/watches/subscriber;
  - send synthetic pace event;
  - assert ingest accepted;
  - optionally assert alert/delivery state when email smoke destination is configured.
- Keep the existing `foretic.*` docs but clearly label them as optional adapter/bundle APIs.

## Out Of Scope

- Foretic app code.
- Public docs site publishing.
- Dashboard UI.
- Billing/usage metering.

## Acceptance Criteria

- Foretic pilot doc answers:
  - exact function names;
  - JSON payloads;
  - SDK examples;
  - idempotency and persistence requirements;
  - known shortfalls and workarounds.
- Smoke script uses the generic admin path, not `foretic.createForecastWatch`.
- Smoke can run in "accepted event" mode without requiring a real recipient.
- If `HEADSUPP_SMOKE_EMAIL_DESTINATION` is configured, smoke can verify delivery state.
- Docs link to `reference.md`, `authentication.md`, `connectors-and-ingest.md`, `email-subscribers.md`, and `watch-types.md`.

## Test Plan

- Add or update automated smoke coverage for the generic admin Foretic pace-email path.
- Run the new smoke locally against a test Worker or deployed Worker when secrets are configured.
- Run existing email subscriber smoke to ensure no regression.
- Add SDK/example verification if new SDK examples are introduced.
- Run `npm run check`.

## API Documentation

Main API docs:

- New `docs/api/foretic-pace-email-pilot.md`.
- Update `docs/api/foretic-provisioning.md` to clarify when not to use `foretic.createForecastWatch`.
- Update `docs/api/README.md`.
- Update `docs/api/smoke-test-suite.md` if a new smoke script is added.

SDK docs:

- Update `docs/public-sdk/getting-started.md` or add a cookbook page for Foretic-style pace email alerts if appropriate for customer-safe docs.
- Update `docs/public-sdk/client-reference.md` if examples use new wrappers from stories 01-05.
- Update `packages/headsupp-client/README.md` and `headsuppclientsdk/docs/` equivalents when SDK docs change.

## Implementation Notes

- The pilot doc should say Foretic must persist Heads Up linkage until stories 01 and 02 are complete.
- Use generic `admin.*` calls in all examples.
- Label synthetic test events as tests in `fields.test = true`.

## Done Definition

- Pilot guide checked in.
- Smoke script added or existing smoke extended.
- Main API docs index and SDK docs updated where relevant.
- Tests/smoke coverage added for the documented path.
- `npm run check` passes.

## Status

Pending.

## Depends On

Can be started immediately as documentation, then updated as stories 01-05 land.
