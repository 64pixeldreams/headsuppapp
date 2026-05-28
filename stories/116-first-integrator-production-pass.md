# First Integrator Production Pass

## User Story

As a first-party integrator or Cursor agent, I need one canonical integration path with consistent API, SDK, and docs, so I can provision a real SaaS alert integration without rediscovering channel, subscriber, signature, cooldown, and debugging rules through trial and error.

## Why This Matters

Foretic's first integration proved the platform can work end to end, including provisioning, signed ingest, forecast email templates, subscriber filters, lifecycle webhooks, workspace callbacks, grouped watch policies, and delivery retries.

The remaining production risk is not one missing feature. It is scattered guidance and weak operational introspection around the exact path a SaaS integrator should follow.

## Feedback Assessment

Carry forward:

- One canonical Foretic-style SaaS integration guide.
- Explicit channel-model decision tree.
- Clear guidance for modeling many resources on one channel.
- Subscriber upsert semantics, including whether `subscriber_key` alone is enough.
- Signature prefix consistency and exact verifier examples for ingest and outbound callbacks.
- Provision and ingest trace/debug API.
- Cooldown testing guidance and suppression visibility.
- Richer partial provisioning errors with section, index, keys, and dependency reason.
- Migration/cleanup guide for old watches/subscribers/channels.
- SDK and raw API examples kept in lockstep.
- Copy-paste known-good payloads for common use cases.

Do not carry forward as-is:

- A Foretic-only runtime API. Foretic examples are useful, but the implementation should stay generic.
- A full dashboard or event ledger UI as part of this story. Add only API/debug surfaces needed to make integrations supportable.
- Changing signature prefixes for backwards compatibility. Instead, document and provide helpers for both directions.

## Recommended Foretic Alert-Board Model

For one channel per user or alert board with many forecast alerts, use this model:

```text
workspace
  one per Foretic account/user/tenant

channel
  one per Foretic alert board when one opt-in/recipient set should cover many forecasts

signals
  shared semantic signal keys, for example forecast.pace.percent

events
  include fields.forecast_id, fields.forecast_name, fields.board_id, and dimensions.forecast_id

watches/watch_groups
  one watch or watch_group per forecast policy, with config filters that select forecast_id

subscribers
  one email subscriber per recipient, using config.filters for alert preferences

cooldowns
  per watch or watch_group, so each forecast policy has its own cooldown even on the shared board channel
```

Use one channel per forecast only when each forecast truly needs separate consent, separate recipient lists, or completely independent channel lifecycle.

If watch config cannot currently filter by event fields/dimensions for all required watch types, add that support in this story rather than telling Foretic to create unique signal keys per forecast. Unique signal keys per forecast are acceptable as a transitional workaround but should not be the recommended long-term model for alert-board channels.

## Scope

### Canonical Integration Guide

Add one primary guide:

```text
docs/api/saas-integration-guide.md
docs/public-sdk/cookbook/saas-integration.md
```

It must cover:

- workspace per SaaS account/user/tenant;
- channel per resource vs channel per alert board;
- connector and signed ingest setup;
- one email subscriber per recipient;
- workspace alert callbacks;
- lifecycle webhook subscribers;
- grouped watch policies;
- subscriber filters;
- rich event fields for templates such as `forecast_alert_v1`;
- cooldown and test-event behavior;
- what IDs/secrets the integrator must persist;
- migration from an older integration shape.

### Channel Model Decision Tree

Update:

```text
docs/api/provisioning.md
docs/api/use-cases.md
docs/api/watch-types.md
docs/public-sdk/use-cases.md
docs/public-sdk/concepts/use-cases.md
packages/headsupp-client/README.md
```

Docs must explicitly say:

```text
Use one channel per resource when:
  each resource needs separate consent/subscribers/cooldowns;
  multiple opt-in emails are acceptable;
  deleting/disabling the resource should isolate every related alert artifact.

Use one channel per alert board/user/account when:
  one opt-in should cover many alerts/resources;
  recipient preferences are managed with subscriber filters;
  the app wants one workspace callback for many resources.
```

### Subscriber Upsert Semantics

Make this unambiguous in API, SDK, and OpenAPI docs:

- `subscriber_key` is the stable idempotency key for repeat provisioning.
- `upsert_existing` is a real property only if the implementation supports it. If stable-key reprovision always updates mutable fields, remove or deprecate `upsert_existing` from docs.
- List mutable fields on reprovision:
  - `name`;
  - `mode`;
  - `enabled`;
  - `config`, including `config.filters`;
  - redacted display metadata as applicable.
- List immutable or protected fields:
  - `destination_url` for email subscribers unless an explicit reauthorization flow is used;
  - authorization state should be preserved when only filters/config are updated.
- State whether updating `config.filters` sends another opt-in email. Expected answer: no.

### Signature Helper Consistency

Update:

```text
docs/api/authentication.md
docs/api/connectors-and-ingest.md
docs/api/webhook-receivers.md
docs/public-sdk/webhook-receivers.md
docs/public-sdk/client-reference.md
packages/headsupp-client/README.md
```

Add exact examples for:

- inbound ingest signatures using `sha256=...`;
- outbound webhook callback signatures using `v1=...`;
- timestamp tolerance;
- canonical raw body handling;
- copy-paste verifier helpers for Node/TypeScript.

Do not silently change existing prefixes unless a compatibility plan exists.

### Trace And Debug API

Add an admin/debug action, for example:

```text
admin.traceEvent
```

Input:

```json
{
  "workspace_id": "ws_...",
  "channel_id": "ch_...",
  "idempotency_key": "foretic:test:123"
}
```

Response should answer:

- raw event accepted or rejected;
- current raw event processing status;
- aggregate row(s) affected;
- watch evaluations attempted;
- alert row created or suppression reason;
- cooldown state when suppressed;
- subscriber filter matches/non-matches;
- delivery rows created;
- latest delivery attempt status, response code/body summary, and retry state.

The API must be tenant-scoped and must not leak destination URLs, secrets, or full provider response bodies.

If full tracing requires a new event/debug table, keep it small and bounded. Do not build a dashboard in this story.

### Partial Provisioning Errors

Improve `admin.provisionChannel` errors so `PROVISION_STEP_FAILED` includes:

- section, for example `watch_groups`;
- index;
- supplied stable key, for example `group_key`, `watch_key`, `signal_key`, or `subscriber_key`;
- dependency reason, for example `signal was not present in payload`, `signal creation failed earlier`, or `signal not found in channel`;
- request id.

### Migration And Cleanup Guide

Add:

```text
docs/api/migration-and-cleanup.md
docs/public-sdk/cookbook/migration-and-cleanup.md
```

Cover:

- disabling old independent watches after moving to watch groups;
- disabling or replacing subscribers without duplicate emails;
- preserving email authorization state;
- moving from one channel per resource to one channel per alert board;
- connector/channel key strategy;
- safe rollout checklist.

### Known-Good Payloads

Add tested examples for:

- one forecast channel with pace alert;
- one user alert-board channel with many forecast alerts;
- one recipient with filters;
- lifecycle webhook subscriber;
- workspace alert callback;
- signed ingest event that triggers warning;
- signed ingest event that triggers critical only through a watch group;
- cooldown-suppressed repeat event.

Examples must be mirrored across API docs and SDK docs.

## API Documentation Requirements

Review and update all affected API docs:

```text
docs/api/README.md
docs/api/reference.md
docs/api/openapi.yaml
docs/api/admin.md
docs/api/provisioning.md
docs/api/foretic-provisioning.md
docs/api/connectors-and-ingest.md
docs/api/webhook-receivers.md
docs/api/subscribers.md
docs/api/email-subscribers.md
docs/api/watch-types.md
docs/api/alerts-and-deliveries.md
docs/api/smoke-test-suite.md
docs/api/use-cases.md
docs/operations-runbook.md
```

## SDK Documentation Requirements

Review and update all affected SDK docs:

```text
docs/public-sdk/README.md
docs/public-sdk/quickstart.md
docs/public-sdk/getting-started.md
docs/public-sdk/client-reference.md
docs/public-sdk/reference.md
docs/public-sdk/use-cases.md
docs/public-sdk/watch-types.md
docs/public-sdk/webhook-receivers.md
docs/public-sdk/concepts/use-cases.md
docs/public-sdk/concepts/watch-types.md
docs/public-sdk/cookbook/email-alerts.md
docs/public-sdk/cookbook/subscriber-lifecycle.md
docs/public-sdk/cookbook/noise-control.md
docs/public-sdk/appendix/raw-api-actions.md
packages/headsupp-client/README.md
packages/headsupp-client/CHANGELOG.md
```

If a docs file is reviewed and no update is needed, mention it in the implementation summary.

## Tests

- Unit tests for any new trace/debug normalization and redaction helpers.
- Unit tests for improved provisioning error metadata.
- Integration tests for `admin.traceEvent` or equivalent debug action.
- Snapshot-style tests or fixture checks for known-good payload examples where practical.
- Existing provisioning, subscriber, watch group, and delivery tests must remain green.

## Acceptance Criteria

- A new integrator can follow one canonical guide without reading chat history.
- Foretic's alert-board-vs-resource-channel decision is answered with a recommended model.
- All API and SDK docs use the same names and shapes for `subscriber_key`, `config.filters`, `forecast_alert_v1`, lifecycle webhooks, workspace subscribers, watch groups, and signature prefixes.
- `admin.provisionChannel` failure responses identify the exact failing payload element.
- A tenant-scoped trace/debug API can explain why a queued event did or did not send an email.
- Cooldown test behavior is documented and visible through debug output.
- Migration/cleanup docs explain how to avoid duplicate emails.

## Test Plan

Run from `apps/headsupp-api`:

```bash
npm run check
npm run smoke:provision-channel
npm run smoke:workspace-subscriber
npm run smoke:subscriber-filters
npm run smoke:delivery-retry
```

Run real-email proof from Story 117 before declaring the platform production-ready.

## Status

Done.
