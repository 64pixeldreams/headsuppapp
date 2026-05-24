# Spec Fit And Proof Tests

This note maps the current API to the product spec and lists the tests that prove it.

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
```

Current result:

```text
137 tests passing
load smoke accepts 10000 synthetic events
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

## More Tests To Prove The API

1. Cooldown proof:
   - Send a triggering event.
   - Send another triggering event inside the cooldown window.
   - Expected: one Slack alert, second alert suppressed.

2. Recovery proof:
   - Configure recovery for a threshold watch.
   - Send a triggering event, then a normal recovery event.
   - Expected: alert, then one recovery notification if recovery is enabled.

3. Idempotency proof:
   - Send the same `idempotency_key` twice.
   - Expected: aggregate changes once, no duplicate alert.

4. Batch proof:
   - Send a batch with hundreds of events.
   - Expected: one accepted ingest response, folded aggregate rows, no per-event Slack spam.

5. Aggregate-forward proof:
   - Configure an `AGGREGATE_FORWARD` watch and webhook subscriber.
   - Close a bucket via scheduled evaluation.
   - Expected: one `aggregate_bucket_closed` delivery with `delivery_id` and `dedupe_key`.

6. Retry proof:
   - Point a subscriber at a temporary endpoint returning `500` or `429`.
   - Expected: delivery moves to `retrying` with backoff.
   - Then return `200`.
   - Expected: delivery becomes `sent`.

7. Missing-expected proof:
   - Configure a `MISSING_EXPECTED` watch.
   - Do not send expected events for the configured window.
   - Expected: scheduled task creates one absence alert.

8. Tenant isolation proof:
   - Create two workspaces/channels with different ownership fields.
   - Send events to each connector.
   - Expected: aggregates and alerts remain scoped to their own workspace/channel.

## Remaining Risk

The current generic smoke seeds deployed D1/KV test state directly because the production admin API still depends on CFKit API-key/session setup. The runtime event engine is proven, but a future hardening pass should add a first-class admin API-key bootstrap flow or documented operator-only provisioning command.
