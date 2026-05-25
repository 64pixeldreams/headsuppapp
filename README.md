# Heads Up

[Heads Up](https://headsupp.io) is an API-first attention-processing engine.

It receives noisy events from other systems, aggregates them into useful signal buckets, evaluates watches against those aggregates, and notifies people or systems only when something meaningful changes.

```text
connector -> channel -> signal -> aggregate -> watch -> alert or forward
```

Heads Up is not a dashboard, BI tool, or per-event alerting system. The core product goal is to turn many raw events into one useful alert, summary, recovery, digest, or aggregate output when needed.

## What It Does

- Accepts signed events through connector webhooks.
- Queues raw events through Cloudflare Queues.
- Aggregates events into D1-backed time buckets.
- Evaluates watches against aggregates, not raw events.
- Applies cooldown, escalation, recovery, missing-expected, digest, and aggregate-forward rules.
- Sends Slack webhook alerts or generic webhook callbacks.
- Retries transient delivery failures with backoff.
- Keeps tenants/workspaces isolated by `source_app`, `external_tenant_id`, `external_user_id`, and `workspace_id`.
- Exposes operator-safe observability for delivery health, retry backlog, and scheduled cron status.
- Supports channel contracts for default dimensions, CTA policy, and watch-template bootstrap.
- Exposes safe alert and watch-state reads so quiet channels remain auditable.
- Supports explicit watch action controls and quiet-summary delivery.

## Current App

The current implementation is the Heads Up Core API:

```text
apps/headsupp-api
```

Cloudflare resources:

```text
Worker: headsupp_app
D1: headsup_db
Queues: headsup-raw-events, headsup-alert-delivery, headsup-aggregate-delivery
Durable Object: WatchEvaluatorDO
KV: HEADSUPP_* namespaces
```

The deployed development Worker is:

```text
https://headsupp_app.martin-598.workers.dev
```

## Important Docs

- Product/spec source: `SPEC_BREIF.md`
- Product brief: `Curosr_headsupp_product_brief.md`
- Cursor project rules: `cursor.js`
- API docs index: `docs/api/README.md`
- API quickstart: `docs/api/quickstart.md`
- API reference: `docs/api/reference.md`
- Authentication and tenant rules: `docs/api/authentication.md`
- Admin/control-plane API: `docs/api/admin.md`
- Event ingest and connectors: `docs/api/connectors-and-ingest.md`
- Subscribers and delivery retry: `docs/api/subscribers.md`
- Aggregate forwarding: `docs/api/aggregate-forwarding.md`
- Observability API: `docs/api/observability.md`
- Schema and migrations: `docs/api/schema-and-migrations.md`
- Smoke test matrix: `docs/api/smoke-test-suite.md`
- Final smoke runbook: `docs/final-smoke-runbook.md`
- Operations runbook: `docs/operations-runbook.md`
- Story index: `stories/README.md`

## Key API Endpoints

```text
GET  /health
GET  /api/v1/health
GET  /api/v1/observability/overview
POST /api/function
POST /v1/events/{connector_key}
```

Control-plane actions use CFKit through `POST /api/function`. Event ingest uses connector-level HMAC and returns `202 Accepted` after validation and queueing.

## Development

```bash
cd apps/headsupp-api
npm install
npm run check
npm run load:smoke
```

Run locally:

```bash
cd apps/headsupp-api
npm run dev
```

Deploy:

```bash
cd apps/headsupp-api
npm run deploy
```

Apply the D1 schema:

```bash
cd apps/headsupp-api
npx wrangler d1 execute headsup_db --remote --file "migrations/0001_headsupp_core.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/0002_correctness_closure.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/0003_channel_contracts_and_read_apis.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/0004_watch_actions_and_quiet_summaries.sql"
npx wrangler d1 execute headsup_db --remote --file "migrations/0005_correctness_closure_runtime.sql"
```

## Tests And Proofs

Local quality gates:

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
```

Deployed smoke tests:

```bash
cd apps/headsupp-api
npm run smoke:generic-slack
npm run smoke:alert-decisions
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
```

These prove:

- Ingest stays fast and asynchronous.
- Normal events stay silent.
- Triggering events produce alerts.
- Cooldown, escalation, and recovery work.
- Scheduled missing-expected, digest, and aggregate-forward watches work.
- Retry and permanent delivery failure behavior works.
- Tenant isolation holds when two workspaces share the same `signal_key`.

Runtime secrets such as Cloudflare API tokens and Slack webhook URLs must be passed through environment variables only. Do not commit them.

## Main Code Paths

- Worker entrypoint: `apps/headsupp-api/src/index.js`
- CFKit function registration: `apps/headsupp-api/src/functions/register-headsupp-functions.js`
- Admin functions: `apps/headsupp-api/src/functions/admin-functions.js`
- Operator functions: `apps/headsupp-api/src/functions/operator-functions.js`
- Event validation: `apps/headsupp-api/src/services/ingest/event-validation.js`
- Raw queue processing: `apps/headsupp-api/src/services/aggregation/consumer.js`
- Watch Durable Object: `apps/headsupp-api/src/durable/WatchEvaluatorDO.js`
- Alert persistence: `apps/headsupp-api/src/services/alerts/persistence.js`
- Delivery services: `apps/headsupp-api/src/services/delivery/`
- Scheduled tasks: `apps/headsupp-api/src/services/scheduler/scheduled-tasks.js`
- Observability: `apps/headsupp-api/src/services/observability/overview.js`
- D1 schema: `apps/headsupp-api/migrations/0001_headsupp_core.sql`, `apps/headsupp-api/migrations/0002_correctness_closure.sql`, `apps/headsupp-api/migrations/0003_channel_contracts_and_read_apis.sql`, `apps/headsupp-api/migrations/0004_watch_actions_and_quiet_summaries.sql`, `apps/headsupp-api/migrations/0005_correctness_closure_runtime.sql`

## CI And Release

GitHub Actions workflow:

```text
.github/workflows/headsupp-api-ci.yml
```

The local CI job runs:

```text
npm run check
npm run load:smoke
```

Deployed release smokes are opt-in and require repository secrets. See `docs/api/smoke-test-suite.md`.

## Status

The core API MVP is built and deployed with local tests, load smoke, deployed smokes, operator bootstrap/auth hardening, audit logging, CI gates, operational health, and runbooks.

Remaining product work should stay story-driven through `stories/README.md`.
