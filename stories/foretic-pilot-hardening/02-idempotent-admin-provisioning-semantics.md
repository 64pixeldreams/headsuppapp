# Idempotent Admin Provisioning Semantics

## User Story

As an integration server, I want generic admin create actions to be safely idempotent when stable keys are supplied, so retries and deploy races do not create duplicate resources or misleading secrets.

## Product Fit

This makes the standalone admin API production-safe without requiring a Foretic-specific provisioning shortcut.

## Scope

- Make generic create actions return the canonical stored row when a stable unique key already exists:
  - `admin.createWorkspace`
  - `admin.createChannel`
  - `admin.createConnector`
  - `admin.createSignal`
  - `admin.createWatch`
  - `admin.createSubscriber`
- Add explicit `created: true | false` in responses where useful.
- For `admin.createConnector`:
  - return `connector_secret` only when `created: true`;
  - never generate and return a new secret if the connector already exists.
- Support caller-supplied stable IDs/keys where already accepted:
  - `workspace_key`
  - `channel_key`
  - `connector_key`
  - `signal_id` or `(channel_id, signal_key)`
  - `watch_id`
  - `subscriber_id` or derived subscriber key
- Preserve tenant and channel scope checks before returning existing rows.

## Out Of Scope

- Bulk provisioning transaction API.
- Foretic-only provisioning rewrites.
- Changing ingest idempotency semantics.
- Backfilling existing duplicate rows.

## Acceptance Criteria

- Repeating `admin.createWorkspace` with the same `workspace_key` returns the same stored workspace and `created: false`.
- Repeating `admin.createChannel` with the same `channel_key` returns the stored channel and `created: false`.
- Repeating `admin.createConnector` with the same `connector_key` returns the stored connector with `secret_returned: false` and no raw `connector_secret`.
- Repeating `admin.createSignal` for the same `(channel_id, signal_key)` returns the stored signal.
- Repeating `admin.createWatch` with a stable `watch_id` returns the stored watch.
- Repeating `admin.createSubscriber` with the same channel/type/mode/email returns the stored subscriber and does not send duplicate confirmation email unless explicitly requested by a later API.

## Test Plan

- Unit tests for each create action repeated twice.
- Connector test proving the second call does not leak or rotate the secret.
- Subscriber test proving no duplicate authorization email on duplicate create.
- Integration test for a full generic Foretic-like provisioning retry.
- SDK tests proving examples/wrappers handle `created: true | false` and stable keys without breaking current response unwrapping.
- Run `npm run check`.

## API Documentation

Main API docs:

- Update `docs/api/reference.md` for `created` response fields.
- Update `docs/api/admin.md` with idempotency rules.
- Update `docs/api/connectors-and-ingest.md` to emphasize one-time connector secret behavior.
- Update `docs/api/foretic-pace-email-pilot.md` if already present, otherwise update this guidance in story 06 when created.

SDK docs:

- Update `docs/public-sdk/getting-started.md` examples to pass stable keys where recommended.
- Update `docs/public-sdk/client-reference.md` response examples for `created` fields if surfaced by wrappers.
- Update `packages/headsupp-client/README.md` and `headsuppclientsdk/docs/` equivalents when SDK docs change.

## Implementation Notes

- Current `insertRow` uses `INSERT OR IGNORE` and returns the input row. Replace create paths with fetch-before/after-insert helpers that return the canonical DB row.
- Be especially careful with connector secrets: the second response must not include a generated-but-unused secret.
- Preserve current response compatibility where practical, adding `created` without removing existing `data.<resource>` shapes.

## Done Definition

- Idempotent semantics implemented for the create actions above.
- Tests cover duplicate/retry behavior.
- Main API docs and SDK docs updated where response shapes or example calls change.
- `npm run check` passes.

## Status

Pending.

## Depends On

01 is helpful but not strictly required.
