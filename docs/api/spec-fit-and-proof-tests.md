# Spec Fit And Proof Tests

This note maps the current API to the product spec and lists the tests that prove it.

For endpoint/action schemas, see [reference.md](reference.md) and [openapi.yaml](openapi.yaml). For the release smoke matrix, see [smoke-test-suite.md](smoke-test-suite.md).

## Current Spec Fit

Heads Up v1 is implemented as an API-only attention-processing engine:

- Cloudflare Worker API for health, control-plane functions, ingest, and observability.
- Cloudflare Queue producers/consumers for raw events and deliveries.
- D1 schema for workspaces, channels, connectors, subscribers, signals, contracts, watches, states, aggregates, alerts, and deliveries.
- Durable Object watch evaluation for serialized per-watch decisions.
- Cron handler for scheduled watch work, aggregate forwarding, retry processing, and dedupe cleanup.
- HMAC-authenticated event ingest that returns `202 Accepted` after validation and queueing.
- Aggregation-first processing: raw events update aggregates; watches evaluate aggregate rows, not raw events.
- Silence by default: normal events do not notify Slack unless a watch triggers.
- Webhook/Slack delivery happens from the delivery queue path, not inline from ingest.

Out of scope for v1, and not implemented:

- Dashboard UI.
- Slack OAuth.
- Billing.
- Email connector.
- BI/charts.
- Per-event alert forwarding.

## Proven Tests

Local automated checks:

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
npm run load:high-volume
npm run soak:release
```

Current result:

```text
unit/integration tests pass
load smoke accepts 10000 synthetic events
high-volume load smoke accepts 100000 synthetic events by default
release soak reports bounded throughput and fold compression
```

Deployed generic Slack smoke:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:generic-slack
```

Observed proof:

```text
20 normal events queued
0 alerts after normal events
1 trigger event queued
1 alert created
1 Slack delivery sent
Slack response 200 ok
Slack message: Generic smoke metric high is warning at 15.
```

This proves the central product promise:

```text
many raw events -> aggregate state -> one useful alert only when meaningful
```

Deployed alert decision smoke:

```powershell
cd apps/headsupp-api
$env:HEADSUPP_SMOKE_SLACK_WEBHOOK_URL='<runtime slack webhook url>'
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:alert-decisions
```

Expected proof:

```text
first trigger creates one warning alert
repeat trigger inside cooldown is suppressed
higher-severity trigger creates one escalation alert
recovery value creates one recovery alert
repeated recovery value is suppressed
```

Deployed scheduled watches smoke:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:scheduled
```

Expected proof:

```text
missing-expected creates one absence alert
digest creates one digest alert and updates watch state
aggregate-forward creates one closed-bucket delivery
aggregate-forward payload includes delivery_id, dimension-safe dedupe_key, dimensions, and safe context when present
later cron pass does not duplicate the same closed-bucket delivery
```

Additional deployed smokes:

```bash
cd apps/headsupp-api
npm run smoke:quiet-summary
npm run smoke:action-controls
npm run smoke:channel-contracts
npm run smoke:aggregate-forward-dimensions
npm run smoke:advanced-watches
npm run smoke:operator-observability
```

Expected proof:

```text
quiet summaries create quiet_summary_deliveries without alert rows
action controls prove snooze, resume, mute, and ignored delivery behavior
channel contracts materialize defaults and safe read shapes
dimensioned aggregate-forwarding filters dimensions and does not duplicate second pass
advanced watches cover WINDOW, DELTA, relative change, reminders, recurring expectations, and rich digests
operator observability covers service-key lifecycle, audit reads, health overview, and redaction
```

Deployed delivery retry smoke:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:delivery-retry
```

Expected proof:

```text
transient webhook failure becomes retrying with backoff metadata
same delivery later becomes sent when destination returns 200
permanent 404 failure becomes failed
retry path creates no duplicate alert rows
```

Deployed tenant isolation smoke:

```powershell
cd apps/headsupp-api
$env:CLOUDFLARE_API_TOKEN='<runtime cloudflare token>'
npm run smoke:tenant-isolation
```

Expected proof:

```text
two workspaces use the same signal_key safely
tenant A trigger does not update tenant B aggregates
tenant B normal event does not notify tenant A subscriber
only the intended tenant gets an alert delivery
```

Additional correctness proofs now covered in code/runtime:

```text
dedupe keys move through processing -> processed state before final duplicate suppression
aggregate-applied idempotency staging prevents retry data loss and double-counted aggregates
late events cannot overwrite aggregate last_value unless last_event_at is newer/equal
contract extraction supports value_path/time_path/cta_path with value.num fallback
dimensioned aggregates isolate fold and watch evaluation by dimensions_hash
DELTA_LT and DELTA_GT watch types are evaluated from adjacent aggregate rows
outbound webhook headers include timestamp/signature/delivery id when signing secret is configured
observability endpoint requires operator auth token
```

## Remaining Risk

The current generic provisioning command is an operator smoke utility backed by Cloudflare API credentials. A future hardening pass should add deployed smoke coverage that provisions through `/api/function` using an API key.

Other non-AI/non-email proof gaps are tracked in [spec-alignment-audit.md](spec-alignment-audit.md): live Foretic Worker proof and migration of some deterministic smoke setup from D1/KV harness operations to `/api/function` provisioning.
