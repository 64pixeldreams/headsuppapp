# Spec Alignment Audit

This audit compares the current Heads Up API with `SPEC_BREIF.md` and `Curosr_headsupp_product_brief.md`.

Status terms:

```text
aligned: implemented and covered by tests or deployed proof
partial: implemented but coverage/docs are incomplete, or the shape differs from the spec
gap: not implemented or not proven enough for production confidence
```

## Summary

Heads Up is aligned with the v1 product direction: it is an API-first attention-processing and aggregation engine, not a dashboard, BI tool, or per-event alerting system.

The core loop is implemented:

```text
connector -> queue -> aggregate -> watch -> alert / aggregate forward
```

The strongest proof is the deployed Slack alert path, alert-decision smoke, scheduled watches smoke, delivery retry smoke, tenant-isolation smoke, quiet-summary smoke, action-controls smoke, channel-contract/read smoke, dimensioned aggregate-forward smoke, advanced-watches smoke, operator observability smoke, local load smoke, and the unit/integration suite.

The remaining non-AI/non-email gaps are now operational polish gaps:

- Some deployed smokes still seed deterministic resources through D1/KV harnesses instead of the public `/api/function` control plane.
- `smoke:foretic` is still fixture/local-runtime oriented rather than a live Foretic Worker integration.
- The checked-in OpenAPI YAML documents the deployed endpoint surface; a generated spec can be added later if endpoint definitions move into structured route metadata.

## Product Principles

### Aggregation-First

Status: aligned.

Evidence:

- Ingest validates and queues events in `apps/headsupp-api/src/index.js`.
- Queue processing normalizes, resolves signals/contracts, folds deltas, and writes aggregates in `apps/headsupp-api/src/services/aggregation/consumer.js`.
- Aggregate upserts use SQL conflict handling in `apps/headsupp-api/src/services/aggregation/aggregate-upsert.js`.
- Watch evaluation loads aggregate rows in `apps/headsupp-api/src/services/watches/watch-evaluator.js`.

Proof:

- `npm run check`
- `npm run load:smoke`
- `npm run smoke:generic-slack`
- `npm run smoke:scheduled`

### Silence By Default

Status: aligned.

Evidence:

- Alert decisions apply cooldown, escalation, recovery, snooze, mute, and duplicate recovery suppression in `apps/headsupp-api/src/services/watches/alert-decision.js`.
- Non-alert outcomes now update watch state through `apps/headsupp-api/src/services/watches/state.js`.
- Quiet summaries are generated separately from alert rows in `apps/headsupp-api/src/services/scheduled-watches/quiet-summary.js`.

Proof:

- `npm run smoke:generic-slack` proves normal events aggregate without Slack alerts.
- `npm run smoke:alert-decisions` proves warning, suppression, escalation, recovery, and repeated recovery suppression.
- `npm run smoke:quiet-summary` proves quiet-summary delivery without normal alert rows.
- `npm run smoke:action-controls` proves snooze, resume, mute, and ignored delivery behavior against the deployed Worker.
- Unit tests cover action-control gating and quiet-summary payloads.

### Fast Ingest

Status: aligned.

Evidence:

- `POST /v1/events/{connector_key}` authenticates connector HMAC, validates payloads, enqueues raw messages, and returns `202 Accepted`.
- Raw event processing happens through Cloudflare Queues, not inline.

Proof:

- Integration tests cover accepted queue responses.
- Deployed smokes send signed ingest requests and poll resulting D1 state.
- `npm run load:smoke` proves fold/compression behavior for 10,000 synthetic events.

### Cloudflare-Native Runtime

Status: aligned.

Evidence:

- Worker, Queues, D1, Durable Object, KV, and Cron bindings are configured in `apps/headsupp-api/wrangler.toml`.
- Scheduled tasks run missing-expected, aggregate-forward, retry, digest, quiet summary, and dedupe cleanup in `apps/headsupp-api/src/services/scheduler/scheduled-tasks.js`.
- Per-watch evaluation is serialized through `WatchEvaluatorDO`.

Proof:

- Deployed smokes exercise the live Worker and D1.
- GitHub Actions runs local checks and can run the deployed smoke matrix with required secrets.

### Correctness Over Cleverness

Status: aligned.

Evidence:

- Aggregate upserts are atomic and dimensioned.
- Raw event idempotency records processing, aggregate-applied, and processed stages.
- Delivery retry state is durable and classified by response status.
- Tenant guards enforce workspace/channel/signal ownership before control-plane writes.

Proof:

- Unit tests cover idempotency retry after aggregate-applied state, dimensioned aggregate-forward IDs, aggregate context preservation, delivery retry, and tenant guards.
- `npm run smoke:delivery-retry` proves retry/backoff and permanent failure behavior.
- `npm run smoke:tenant-isolation` proves shared signal keys do not leak across workspaces.
- `npm run smoke:scheduled` proves scheduled `MISSING_EXPECTED` and `DIGEST` alert-delivery rows are created and dispatched, and aggregate-forward does not duplicate the same closed bucket.
- Unit tests prove scheduled `MISSING_EXPECTED`, `REMINDER_DUE`, and `DIGEST` enqueue created alert deliveries when a queue binding exists.
- Unit tests prove duplicate aggregate-forward rows are not re-enqueued.

## Feature Alignment

### Workspace, Channel, Connector, Signal, Watch, Subscriber Models

Status: aligned.

Evidence:

- Core tables are in `apps/headsupp-api/migrations/0001_headsupp_core.sql`.
- Admin CFKit actions are registered in `apps/headsupp-api/src/functions/admin-functions.js`.
- Control-plane implementation is in `apps/headsupp-api/src/services/admin/control-plane.js`.

Spec note:

The implementation uses CFKit `POST /api/function` actions instead of separate REST endpoints such as `/v1/workspaces`. This is an intentional current API shape, but it should be documented clearly for users.

### Event Ingest

Status: aligned.

Evidence:

- Connector HMAC, timestamp validation, batch support, queue chunking, and connector ownership resolution are implemented under `apps/headsupp-api/src/services/connectors` and `apps/headsupp-api/src/services/ingest`.

Proof:

- HMAC, event validation, raw queue, and integration tests.
- Deployed smokes use signed ingest requests.

### Watch Types

Status: partial.

Implemented:

```text
LAST_VALUE_GT
LAST_VALUE_LT
WINDOW_AVG_GT
WINDOW_AVG_LT
WINDOW_SUM_GT
WINDOW_COUNT_GT
DELTA_GT
DELTA_LT
PERCENT_CHANGE_GT
PERCENT_CHANGE_LT
PREVIOUS_PERIOD_RATIO_GT
PREVIOUS_PERIOD_RATIO_LT
SPIKE_GT
MISSING_EXPECTED
REMINDER_DUE
DIGEST
AGGREGATE_FORWARD
```

Proof:

- Local tests cover core evaluator behavior.
- Deployed smokes cover `LAST_VALUE_GT`, `MISSING_EXPECTED`, `DIGEST`, `AGGREGATE_FORWARD`, `WINDOW_*`, `DELTA_*`, relative-change watches, `REMINDER_DUE`, recurring-expectation v2, and rich weekly digest payloads.
- `npm run smoke:advanced-watches` is the deployed proof for the newer watch families.

### Alerts And Deliveries

Status: aligned.

Evidence:

- Alert persistence, watch state updates, delivery rows, Slack/generic webhook payloads, signing, and retry/backoff are implemented under `apps/headsupp-api/src/services/alerts` and `apps/headsupp-api/src/services/delivery`.

Proof:

- `npm run smoke:generic-slack`
- `npm run smoke:alert-decisions`
- `npm run smoke:delivery-retry`
- `npm run smoke:scheduled`

### Aggregate Forwarding

Status: aligned.

Evidence:

- Aggregate-forward watches select closed buckets and create `aggregate_deliveries`.
- Payloads include stable delivery IDs, dimension hash, dimensions, values, safe fields, and source CTA when present.

Proof:

- `npm run smoke:scheduled` proves closed-bucket D1 delivery creation.
- `npm run smoke:aggregate-forward-dimensions` proves dimension-filtered deployed forwarding and no duplicate second pass.
- Unit tests prove dimension-safe delivery IDs and payload shape.

### Foretic

Status: partial.

Evidence:

- Foretic provisioning creates D1-backed runtime resources and forecast watches.
- Foretic-shaped event examples preserve CTA and fields.

Proof:

- Foretic unit tests and `npm run smoke:foretic`.

Gap:

- `smoke:foretic` is fixture/local-runtime oriented. A deployed Foretic smoke should exercise the live Worker path.

### Channel Contracts, Read APIs, Action Controls, Quiet Summaries, Reminders, And Rich Digests

Status: aligned.

Evidence:

- Channel contract actions and runtime defaults are implemented in admin control-plane and signal resolution.
- Alert/watch-state reads are implemented in `apps/headsupp-api/src/services/admin/read-models.js`.
- Snooze/mute/resume/ignore controls are implemented in `apps/headsupp-api/src/services/watches/action-controls.js`.
- Quiet summaries are implemented in scheduled and delivery services.
- Reminder watches are implemented in scheduled services.
- Weekly/monthly multi-signal digest summaries are implemented in scheduled services.

Proof:

- Unit tests cover these paths.
- `npm run smoke:channel-contracts`
- `npm run smoke:action-controls`
- `npm run smoke:quiet-summary`
- `npm run smoke:advanced-watches`

## Out Of Scope For V1

Status: aligned.

Not implemented by design:

- AI extraction
- Email connector
- Dashboard
- Charts/BI
- Slack OAuth
- Billing
- User-facing frontend
- ML/anomaly detection

## Recommended Next Stories

Non-AI/non-email follow-up stories should focus on the remaining proof polish:

1. Replace more deterministic D1/KV smoke setup with `/api/function` provisioning where it does not weaken cleanup or proof reliability.
2. Add a live Foretic Worker smoke when Foretic runtime details are available.
3. Consider generating `openapi.yaml` from structured endpoint metadata if the route/action registry is later made machine-readable.
