# Event Occurrence Watches

Status: implemented.

Implemented in:

- `apps/headsupp-api/migrations/0010_watch_occurrences.sql`
- `apps/headsupp-api/src/services/watches/evaluate-watch.js`
- `apps/headsupp-api/src/services/watches/watch-evaluator.js`
- `apps/headsupp-api/scripts/event-occurrence-smoke.mjs`
- `apps/headsupp-api/scripts/email-design-smoke.mjs`
- API docs, SDK docs, OpenAPI, smoke docs, and deployment runbook

## User Story

As a SaaS integrator, I need Heads Up to trigger alerts from distinct business-event occurrences, so events like forecast bucket closed, goal reached, import completed, payment failed, or milestone achieved can notify users once per real occurrence without threshold/recovery workarounds.

## Why This Matters

Heads Up already handles stateful threshold watches well. But some important customer moments are not threshold states:

```text
forecast.bucket.close
forecast.goal.reached
forecast.period.beat_target
forecast.period.missed_target
payment.failed
job.completed
import.failed
```

These should be first-class attention events. They should not require `LAST_VALUE_GT`, cooldown tricks, or artificial recovery dips. The platform needs a professional, reusable `EVENT_OCCURRENCE` watch type that fires once per configured occurrence key and then uses the normal Heads Up delivery pipeline.

## Product Fit

This extends Heads Up as an attention-processing API:

```text
raw event -> event occurrence watch -> alert -> email / Slack / webhook delivery
```

It is not a dashboard feature, visual rule builder, marketing email composer, or Foretic-only path. Foretic is the first use case, but the primitive should be generic.

## Proposed Watch Type

```text
EVENT_OCCURRENCE
```

Alias, if useful:

```text
EVENT_MATCH
```

Prefer one canonical watch type in docs and API. Use `EVENT_OCCURRENCE` unless implementation reveals a better name.

## Core Behavior

An `EVENT_OCCURRENCE` watch:

- evaluates incoming event context, not only aggregate threshold state;
- matches configured event fields such as `fields.event_type`;
- builds one alert for each distinct occurrence key;
- dedupes repeated events for the same occurrence;
- does not require recovery to fire the next occurrence;
- supports normal watch cooldown only as optional extra protection, not as the core dedupe mechanism;
- uses the existing alert persistence, subscriber routing, delivery queues, email rendering, Slack rendering, webhook rendering, retries, and observability paths.

## Example Configs

Goal reached:

```json
{
  "watch_type": "EVENT_OCCURRENCE",
  "config": {
    "event_type": "goal_reached",
    "dedupe_key_path": "fields.goal_id",
    "severity": "success",
    "template_id": "forecast_win_v1"
  }
}
```

Bucket close:

```json
{
  "watch_type": "EVENT_OCCURRENCE",
  "config": {
    "event_type": "bucket_closed",
    "dedupe_key_path": "fields.bucket_end",
    "severity_path": "fields.outcome_severity",
    "template_by_outcome": {
      "beat": "forecast_win_v1",
      "miss": "forecast_alert_v1",
      "neutral": "metric_alert_v1"
    }
  }
}
```

Generic integration event:

```json
{
  "watch_type": "EVENT_OCCURRENCE",
  "config": {
    "event_type": "payment_failed",
    "dedupe_key_path": "idempotency_key",
    "severity": "critical",
    "required_fields": ["customer_id", "invoice_id"]
  }
}
```

## Event Payload Contract

Recommended event shape:

```json
{
  "idempotency_key": "foretic:forecast_123:goal_reached:goal_456",
  "signal_key": "forecast.goal.reached",
  "occurred_at": "2026-06-24T12:00:00.000Z",
  "value": { "num": 1 },
  "fields": {
    "event_type": "goal_reached",
    "tone": "success",
    "icon_variant": "trophy",
    "forecast_id": "forecast_123",
    "goal_id": "goal_456",
    "forecast_name": "Q2 Revenue",
    "resource_name": "Q2 Revenue",
    "notification": {
      "title": "Q2 Revenue",
      "summary": "Goal reached: £10,000 hit 6 days early.",
      "detail": "Best value to date is £10,250 against a £10,000 goal.",
      "headline_value": "£10,000",
      "headline_label": "Goal reached"
    },
    "metrics": [
      { "label": "Goal", "value": "£10,000" },
      { "label": "Observed", "value": "£10,250" },
      { "label": "Reached on", "value": "24 Jun 2026" },
      { "label": "Days early", "value": "6" }
    ]
  },
  "cta": {
    "label": "View forecast",
    "url": "https://example.com/forecasts/forecast_123",
    "variant": "success"
  }
}
```

## Dedupe Rules

Add deterministic occurrence dedupe separate from threshold cooldown.

Requirements:

- Build occurrence key from `config.dedupe_key_path`.
- If no `dedupe_key_path` is configured, default to event `idempotency_key`.
- Scope dedupe at least by:

```text
workspace_id
channel_id
watch_id
occurrence_key
```

- Replaying the same occurrence must not create a second alert or second delivery.
- A new occurrence key must be allowed to alert even if the previous occurrence had no recovery.
- Dedupe state must be persisted in D1, not memory.

Implementation options:

- Add a dedicated table such as `watch_occurrences`.
- Or extend watch state only if it can safely store multiple occurrence keys without losing historical dedupe.

Prefer a small dedicated table:

```sql
CREATE TABLE IF NOT EXISTS watch_occurrences (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  occurrence_key TEXT NOT NULL,
  alert_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_occurrences_unique
ON watch_occurrences(workspace_id, channel_id, watch_id, occurrence_key);
```

## Matching Rules

Minimum supported config:

```text
event_type
dedupe_key_path
severity
severity_path
template_id
template_by_outcome
required_fields
```

Path lookup should use the existing structured payload helpers where possible, not ad hoc string parsing.

Matching behavior:

- If `config.event_type` exists, it must match `fields.event_type`.
- If `config.required_fields` exists, every listed path must resolve to a non-empty value.
- If `config.severity_path` resolves, use it; otherwise use `config.severity`; otherwise default to `info`.
- If `config.template_by_outcome` exists, use `fields.outcome` or configured outcome path to select event template metadata.

Keep the v1 scope small if needed:

- Support exact `event_type` matching.
- Support one `dedupe_key_path`.
- Support fixed `severity`.
- Support event-provided `fields.tone` and `cta.variant`.

## Alert Payload Requirements

The generated alert must preserve event fields so email, Slack, and webhook delivery all work:

- `fields.notification`
- `fields.metrics`
- `fields.display`
- `fields.tone`
- `fields.icon_variant`
- `cta`
- original event context needed for `admin.traceEvent`

For positive events, the event can use:

```text
fields.tone = "success"
fields.icon_variant = "trophy" | "award" | "medal" | "rocket" | "trendup" | "target_hit" | "target"
cta.variant = "success"
```

This should route email to `forecast_win_v1` when appropriate.

## Subscriber Filters

Current subscriber filters support:

```text
signal_keys
watch_group_keys
watch_keys
band_keys
```

For this story:

- Ensure `EVENT_OCCURRENCE` alerts expose stable `signal_key` and `watch_key`.
- Document that per-forecast preferences can be handled by stable per-forecast watch keys or watch group keys.
- If implementation is straightforward, add optional filter support for event fields/dimensions, but do not block the core watch type on this.

Potential future extension:

```json
{
  "filters": {
    "fields": {
      "forecast_id": ["forecast_123"]
    }
  }
}
```

If field/dimension filters are added in this story, update tests, SDK docs, and API docs accordingly.

## API And SDK Updates

Main API docs to update:

- `docs/api/watch-types.md`
- `docs/api/connectors-and-ingest.md`
- `docs/api/alerts-and-deliveries.md`
- `docs/api/email-rendering.md`
- `docs/api/subscribers.md`
- `docs/api/provisioning.md`
- `docs/api/reference.md`
- `docs/api/openapi.yaml`
- `docs/api/smoke-test-suite.md`

SDK docs to update:

- `docs/public-sdk/client-reference.md`
- `docs/public-sdk/reference.md`
- `docs/public-sdk/cookbook/email-alerts.md`
- `docs/public-sdk/concepts/watch-types.md`
- package README/changelog if public examples change

Client SDK changes:

- No new SDK method is required if existing `createWatch`, `provisionChannel`, and `sendEvent(s)` work.
- Add examples for creating an `EVENT_OCCURRENCE` watch and sending a matching event.
- If typed watch configs exist, add `EVENT_OCCURRENCE` config typing/documentation.

## Smoke Tests

Add deployed smoke coverage.

Minimum smoke:

```text
npm run smoke:event-occurrence
```

The smoke must:

1. Provision a workspace/channel/connector/signal.
2. Provision an `EVENT_OCCURRENCE` watch for `goal_reached`.
3. Provision at least one webhook or smoke transport subscriber.
4. Send one matching event.
5. Assert exactly one alert and one sent delivery.
6. Replay the exact same event/idempotency/occurrence key.
7. Assert no duplicate alert/delivery.
8. Send a second event with a different occurrence key.
9. Assert a second alert/delivery is created without recovery.

## Real Email Proof

Add real email proof for the success path.

Either extend:

```text
npm run smoke:email-design
```

or add:

```text
npm run smoke:event-occurrence-email
```

The real email proof must:

- send to `HEADSUPP_SMOKE_EMAIL_DESTINATION`;
- use `EVENT_OCCURRENCE`;
- use `fields.tone = "success"`;
- use `icon_variant = "trophy"`;
- render `forecast_win_v1`;
- assert delivery status is `sent`;
- assert response body includes `template_id = forecast_win_v1`.

Do not run human-recipient matrix smokes automatically. Keep this manual/operator-run like the other real email proof commands.

## Unit And Integration Tests

Required tests:

- evaluator supports `EVENT_OCCURRENCE`;
- matching event fires alert;
- non-matching `event_type` does not fire;
- missing required field does not fire or returns a clear unsupported reason;
- duplicate occurrence key does not create duplicate alert;
- second occurrence key fires even without recovery;
- alert payload preserves notification, metrics, tone, icon variant, and CTA;
- subscriber filters by watch/signal still work;
- real email renderer selects `forecast_win_v1` from `fields.tone = "success"`;
- tenant scoping is preserved.

## Observability

Update `admin.traceEvent` output if needed so event occurrence decisions are debuggable:

```text
matched EVENT_OCCURRENCE watch
occurrence_key
dedupe result: created | duplicate
alert_id
delivery status
subscriber filter matches
```

Do not leak connector secrets, full webhook URLs, or customer payload secrets.

## Backwards Compatibility

- Existing watch types must continue unchanged.
- Existing `forecast_alert_v1` risk emails must continue unchanged.
- Existing `forecast_win_v1` success rendering must continue working.
- Existing subscriber filters must continue working.
- Existing smokes must remain green.

## Acceptance Criteria

- `EVENT_OCCURRENCE` watch type exists and can be provisioned through existing admin APIs.
- Matching events create one alert per configured occurrence key.
- Duplicate occurrence keys do not create duplicate alerts/deliveries.
- New occurrence keys can alert without recovery.
- Success occurrence events can render `forecast_win_v1`.
- Email, Slack, and webhook delivery paths work from occurrence alerts.
- API docs, SDK docs, OpenAPI, and smoke docs are updated.
- Deployed smoke proves occurrence dedupe and second occurrence behavior.
- Real email proof sends a `forecast_win_v1` success email from an occurrence watch.
- `npm test` / `npm run check` passes.

## Out Of Scope

- Visual watch builder.
- Raw event search UI.
- Billing/metering.
- Arbitrary marketing notification composer.
- Foretic-only endpoint names.

## Suggested Build Order

1. Add occurrence dedupe persistence.
2. Add evaluator support for `EVENT_OCCURRENCE`.
3. Preserve event payload in generated alert context.
4. Add unit tests for matching and dedupe.
5. Add deployed smoke.
6. Add real email proof using `forecast_win_v1`.
7. Update API docs, SDK docs, OpenAPI, and story index.
8. Run full tests and smokes.
