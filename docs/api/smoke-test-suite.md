# Smoke Test Suite

This index explains the current Heads Up proof suite. It is the release checklist for proving the API still matches the product brief.

## Runtime Rules

Never commit runtime secrets. Set these only in the shell that runs the smoke:

```text
CLOUDFLARE_API_TOKEN
HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
HEADSUPP_SMOKE_BASE_URL
HEADSUPP_SMOKE_D1_DATABASE_ID
HEADSUPP_SMOKE_KV_NAMESPACE_ID
HEADSUPP_SMOKE_WEBHOOK_URL
HEADSUPP_SMOKE_RETRY_FAIL_URL
HEADSUPP_SMOKE_RETRY_SUCCESS_URL
HEADSUPP_SMOKE_PERMANENT_FAIL_URL
HEADSUPP_OPERATOR_TOKEN
HEADSUPP_SMOKE_EMAIL_DESTINATION
```

Most deployed smokes require `CLOUDFLARE_API_TOKEN` because the operator harness provisions deterministic D1/KV test resources. Slack-specific smokes also require `HEADSUPP_SMOKE_SLACK_WEBHOOK_URL`.

## Minimum Release Proof

Before declaring a deployed API healthy, run:

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
npm run load:high-volume
npm run smoke:generic-slack
npm run smoke:alert-decisions
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
npm run smoke:foretic
npm run smoke:quiet-summary
npm run smoke:action-controls
npm run smoke:channel-contracts
npm run smoke:aggregate-forward-dimensions
npm run smoke:advanced-watches
npm run smoke:operator-observability
npm run smoke:email-subscriber
npm run soak:release
```

If Slack is unavailable, do not claim human notification proof. You can still run the non-Slack deployed smokes to prove scheduler, retry, and tenant isolation behavior in D1.

GitHub Actions runs `npm run check` and `npm run load:smoke` on PRs and pushes to `main`. The deployed smoke matrix runs on schedule and can also be run manually through the `workflow_dispatch` input `run_deployed_smokes=true`. Deployed smokes require repository secrets.

## CI Secrets

Required only for opt-in deployed release smokes:

```text
CLOUDFLARE_API_TOKEN
HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
HEADSUPP_BOOTSTRAP_TOKEN
HEADSUPP_OPERATOR_TOKEN
```

The CI workflow verifies the core deployed-smoke variables before running deployed smokes. Operator observability also needs `HEADSUPP_BOOTSTRAP_TOKEN` and `HEADSUPP_OPERATOR_TOKEN`; CI skips only that smoke when those operator-only secrets are absent. It does not print secret values.

## Coverage Matrix

```text
smoke:generic-slack      Slack + deployed  silence on normal events, one alert on trigger, sent Slack delivery
smoke:alert-decisions    Slack + deployed  warning, cooldown suppression, critical escalation, recovery
smoke:foretic            Slack + local     Foretic-shaped provision/event/Slack payload loop
smoke:scheduled          D1 + deployed     MISSING_EXPECTED, DIGEST, AGGREGATE_FORWARD delivery rows
smoke:delivery-retry     HTTP + deployed   retrying, sent, failed delivery states and no duplicate alerts
smoke:tenant-isolation   D1 + deployed     same signal_key across tenants without alert/aggregate leakage
smoke:quiet-summary      HTTP + deployed   quiet_summary_deliveries without normal alert rows
smoke:action-controls    Slack + deployed  snooze, resume, mute, and ignored delivery states
smoke:channel-contracts  API/D1 + deployed channel contracts, inherited signal defaults, read API safe shapes
smoke:aggregate-forward-dimensions D1 + deployed dimension-filtered aggregate forwarding and no duplicate second pass
smoke:advanced-watches   D1 + deployed     WINDOW, DELTA, relative change, reminders, recurring expectations, rich digest
smoke:operator-observability API + deployed key lifecycle, audit read, observability overview, redaction
smoke:email-subscriber  Email + deployed  provisions email subscriber, triggers coffee highest-purchase alert, verifies sent delivery
load:smoke               local             10000 synthetic events fold into fewer aggregate deltas
load:high-volume         local             configurable high-volume synthetic proof, default 100000 events
soak:release             local             bounded throughput and fold-compression release proof
```

Use Slack-backed smokes only for features where a human notification is meaningful. D1/API assertions are the right proof for tenant isolation, retry state, scheduler state, and aggregate-forward rows.

## Local Quality Gates

Command:

```bash
npm run check
```

Principles proved:

```text
correctness over cleverness
tenant boundary helpers
HMAC validation
event validation
aggregate upsert behavior
watch decisions
delivery retry classification
scheduled watch helpers
```

Pass signal:

```text
all node:test tests pass
```

Command:

```bash
npm run load:smoke
```

Principles proved:

```text
ingest fast
aggregation-first
queue messages are foldable into fewer aggregate deltas
idempotency keys stay unique
```

Expected output:

```text
input_events: 10000
queue_messages: 10000
folded_deltas much lower than aggregate_deltas
ok: true
```

Command:

```bash
npm run load:high-volume
```

Optional tuning:

```text
HEADSUPP_HIGH_VOLUME_EVENT_COUNT
```

Expected output:

```text
input_events: 100000 by default
queue_messages equals input_events
folded_deltas much lower than aggregate_deltas
ok: true
```

This is local synthetic proof. Increase the count manually for heavier validation; do not run million-event proof in every CI job.

Command:

```bash
npm run soak:release
```

Optional tuning:

```text
HEADSUPP_SOAK_DURATION_SECONDS
HEADSUPP_SOAK_INTERVAL_MS
HEADSUPP_SOAK_EVENTS_PER_TICK
```

Expected output:

```text
ok: true
summary.total_events > 0
summary.fold_compression_ratio < 1
summary.throughput_events_per_second > 0
```

## Deployed Generic Slack Smoke

Command:

```bash
npm run smoke:generic-slack
```

Requires:

```text
CLOUDFLARE_API_TOKEN
HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
```

Product principle:

```text
silence by default
aggregation-first
real Slack alert delivery
```

Expected D1 changes:

```text
normal events create aggregate rows
normal events create zero alerts
trigger event creates one alert
trigger event creates one sent alert delivery
```

Expected Slack message:

```text
Generic smoke metric high is warning at 15.
```

Cleanup behavior:

```text
reuses deterministic smoke IDs
deletes prior matching smoke rows before provisioning
does not delete non-smoke resources
```

## Deployed Alert Decision Smoke

Command:

```bash
npm run smoke:alert-decisions
```

Requires:

```text
CLOUDFLARE_API_TOKEN
HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
```

Product principle:

```text
silence by default
cooldown
severity escalation
recovery
```

Expected D1 changes:

```text
first trigger creates one warning alert
repeat trigger inside cooldown creates no extra alert
higher severity creates one critical escalation alert
recovery value creates one recovery alert
repeated recovery creates no extra alert
```

Expected Slack messages:

```text
Generic alert decision smoke is warning at 15.
Generic alert decision smoke is critical at 25.
Generic alert decision smoke is recovery at 5.
```

Cleanup behavior:

```text
reuses deterministic alert decision smoke resources
removes previous smoke alerts, deliveries, aggregates, watches, subscribers, connectors, channels, and workspace rows for that scenario
```

## Deployed Scheduled Watches Smoke

Command:

```bash
npm run smoke:scheduled
```

Requires:

```text
CLOUDFLARE_API_TOKEN
```

Optional:

```text
HEADSUPP_SMOKE_WEBHOOK_URL
```

Product principle:

```text
scheduled intelligence
absence detection
digest behavior
aggregation gateway output
```

Expected D1 changes:

```text
MISSING_EXPECTED creates one absence alert
DIGEST creates one digest alert
DIGEST updates watch_states.last_digest_at
AGGREGATE_FORWARD creates one aggregate_deliveries row
aggregate-forward payload includes delivery_id
aggregate-forward payload includes dedupe_key
second cron pass does not duplicate the same closed-bucket delivery
```

Expected webhook behavior:

```text
this smoke proves D1 delivery creation
it does not require a real webhook receiver unless HEADSUPP_SMOKE_WEBHOOK_URL is supplied
```

Cleanup behavior:

```text
uses deterministic scheduled smoke IDs
removes prior scheduled smoke state before provisioning
```

## Deployed Delivery Retry Smoke

Command:

```bash
npm run smoke:delivery-retry
```

Requires:

```text
CLOUDFLARE_API_TOKEN
```

Optional endpoint overrides:

```text
HEADSUPP_SMOKE_RETRY_FAIL_URL
HEADSUPP_SMOKE_RETRY_SUCCESS_URL
HEADSUPP_SMOKE_PERMANENT_FAIL_URL
```

Product principle:

```text
delivery reliability
retry and backoff
no duplicate alerts from retry processing
```

Expected D1 changes:

```text
transient failure stores alert delivery as retrying
retrying delivery gets next_retry_at
after destination returns 200, same delivery becomes sent
permanent 404 delivery becomes failed
retry path does not create duplicate alert rows
attempt_count and response_code are persisted
```

Cleanup behavior:

```text
uses deterministic delivery retry smoke resources
removes prior retry smoke state before provisioning
```

## Deployed Tenant Isolation Smoke

Command:

```bash
npm run smoke:tenant-isolation
```

Requires:

```text
CLOUDFLARE_API_TOKEN
```

Optional:

```text
HEADSUPP_SMOKE_WEBHOOK_URL
```

Product principle:

```text
tenant isolation
same signal_key in separate workspaces
connector-owned ingest context
```

Expected D1 changes:

```text
tenant A aggregate last_value is 15
tenant B aggregate last_value is 5
tenant A creates one alert and one delivery
tenant B creates zero alerts and zero deliveries
tenant A and tenant B both used demo.shared.metric
```

Cleanup behavior:

```text
uses deterministic tenant A and tenant B smoke IDs
cleans only matching smoke resources
```

## Operator Provisioning Smoke

Command:

```bash
npm run provision:generic-smoke
```

Requires:

```text
CLOUDFLARE_API_TOKEN
HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
```

Purpose:

```text
creates a reusable generic workspace/channel/connector/signal/watch/subscriber
prints a redacted setup summary
does not send events
```

## Foretic Smoke

Command:

```bash
npm run smoke:foretic
```

Requires:

```text
HEADSUPP_SMOKE_SLACK_WEBHOOK_URL
HEADSUPP_SMOKE_DISPATCH_SLACK=true
```

Purpose:

```text
proves the first Foretic-shaped integration loop
uses Foretic fixtures and user_id as the temporary tenant boundary
```

This is useful for the Foretic integration, but the generic smokes are the product-level proof for Heads Up itself.

## Current Missing Coverage

Known gaps:

```text
deployed generic smokes still use some operator D1 cleanup/setup for deterministic proof data
Foretic smoke is fixture/local-runtime oriented, not a live Worker smoke
OpenAPI YAML is checked in, but it is not generated from route metadata yet
no email connector, Slack OAuth, dashboard, billing, or BI proof because they are out of v1 scope
```

The deployed smoke suite now includes dedicated scripts for quiet summaries, action controls, channel contracts/read APIs, dimensioned aggregate-forwarding, advanced watches, reminders, recurring expectations, rich digests, and operator observability. Some deterministic setup still uses the operator D1/KV harness so each smoke can clean up after itself safely.

Smoke harness migration path: keep deterministic D1/KV setup for tests that need precise cleanup and seeded scheduler state, but prefer `/api/function` provisioning for new smokes where the public control plane can create the needed resources without weakening proof reliability.

## Release Checklist

Run this checklist before calling a deployment proven:

```text
1. npm run check passes
2. npm run load:smoke passes
3. npm run smoke:generic-slack passes or Slack outage is explicitly recorded
4. npm run smoke:alert-decisions passes
5. npm run smoke:scheduled passes
6. npm run smoke:delivery-retry passes
7. npm run smoke:tenant-isolation passes
8. npm run smoke:foretic passes when Foretic-shaped proof is in scope
9. npm run smoke:quiet-summary passes
10. npm run smoke:action-controls passes
11. npm run smoke:channel-contracts passes
12. npm run smoke:aggregate-forward-dimensions passes
13. npm run smoke:advanced-watches passes
14. npm run smoke:operator-observability passes when operator secrets are configured
15. npm run smoke:email-subscriber passes when SEND_EMAIL and recipient env are configured
16. npm run soak:release passes
17. docs mention any intentionally skipped smoke and why
18. secret scan finds no real Slack webhook URLs, API tokens, or connector secrets
```
