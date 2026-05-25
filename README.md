# Heads Up

[Heads Up](https://headsupp.io) is an API-first attention-processing engine.

Heads Up is proprietary software. The intellectual property is owned by 64 Pixel Holdings LLC and operated by Inc64 LLC. See `LICENSE`.

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
- Supports latest-value, total-in-period, average-in-window, count, delta, percent-change, spike, reminder, and recurring-expectation watches.
- Sends Slack webhook alerts or generic webhook callbacks.
- Retries transient delivery failures with backoff.
- Keeps tenants/workspaces isolated by `source_app`, `external_tenant_id`, `external_user_id`, and `workspace_id`.
- Exposes operator-safe observability for delivery health, retry backlog, and scheduled cron status.
- Supports channel contracts for default dimensions, CTA policy, and watch-template bootstrap.
- Exposes safe alert and watch-state reads so quiet channels remain auditable.
- Supports explicit watch action controls and quiet-summary delivery.

## Operational App

The current implementation is the operational Heads Up Core API:

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
- Documentation map and policy: `docs/README.md`
- Cursor project rules: `cursor.js`
- API docs index: `docs/api/README.md`
- API quickstart: `docs/api/quickstart.md`
- First-run API key guide: `docs/api/getting-started-api-keys.md`
- Webhook receiver guide: `docs/api/webhook-receivers.md`
- Watch type feature guide: `docs/api/watch-types.md`
- Node/Cloudflare client wrapper: `docs/api/node-cloudflare-client.md`
- Foretic wrapper guide: `docs/api/foretic-wrapper-guide.md`
- Cursor API instruction sheet: `docs/api/cursor-api-instructions.md`
- API reference: `docs/api/reference.md`
- OpenAPI endpoint surface: `docs/api/openapi.yaml`
- Spec alignment audit: `docs/api/spec-alignment-audit.md`
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
- Historical docs archive: `docs/archive/README.md`
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

## Recommended Client Wrapper

Most integrations should use the private Node/Cloudflare wrapper instead of calling the raw API directly. The wrapper hides `POST /api/function`, unwraps API responses, signs connector events, and works in Node 20+ and Cloudflare Workers.

Package:

```text
@64pixeldreams/headsupp-client
```

Install options:

```bash
# Preferred private GitHub Packages install
npm install @64pixeldreams/headsupp-client@0.1.0

# Local development from this repo
npm install ../headsupp/packages/headsupp-client

# Tag-pinned Git fallback from the private SDK repo
npm install git+ssh://git@github.com/64pixeldreams/headsuppclientsdk.git#v0.1.0
```

For GitHub Packages, consuming projects need:

```text
@64pixeldreams:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
always-auth=true
```

Use a GitHub token with `read:packages` for third-party installs.

Minimal setup:

```js
import { createHeadsUpClient } from '@64pixeldreams/headsupp-client';

const headsup = createHeadsUpClient({
  baseUrl: process.env.HEADSUPP_BASE_URL,
  apiKey: process.env.HEADSUPP_API_KEY,
});

const workspace = await headsup.createWorkspace({
  name: 'Demo Workspace',
  source_app: 'headsupp-demo',
  external_tenant_id: 'demo-tenant',
  external_user_id: 'demo-user',
});
```

Send a signed event:

```js
await headsup.sendEvent({
  connectorKey: process.env.HEADSUPP_CONNECTOR_KEY,
  connectorSecret: process.env.HEADSUPP_CONNECTOR_SECRET,
  event: {
    idempotency_key: 'evt_demo_001',
    signal_key: 'demo.metric',
    occurred_at: new Date().toISOString(),
    value: { num: 15 },
    fields: { source: 'demo' },
  },
});
```

Start with `docs/api/quickstart.md` for the full API journey, `docs/api/getting-started-api-keys.md` for first-run key setup, `docs/api/webhook-receivers.md` for Slack/generic callbacks, `docs/api/watch-types.md` for supported features, and `docs/api/node-cloudflare-client.md` for the SDK.

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
npm run load:high-volume
```

Deployed smoke tests:

```bash
cd apps/headsupp-api
npm run smoke:generic-slack
npm run smoke:alert-decisions
npm run smoke:scheduled
npm run smoke:delivery-retry
npm run smoke:tenant-isolation
npm run smoke:quiet-summary
npm run smoke:action-controls
npm run smoke:channel-contracts
npm run smoke:aggregate-forward-dimensions
npm run smoke:advanced-watches
npm run smoke:operator-observability
```

These prove:

- Ingest stays fast and asynchronous.
- Normal events stay silent.
- Triggering events produce alerts.
- Cooldown, escalation, and recovery work.
- Scheduled missing-expected, digest, and aggregate-forward watches work.
- Week buckets, relative-change watches, reminders, richer recurring expectations, and weekly/monthly digests have deployed and local coverage.
- Quiet summaries, action controls, channel contracts/read APIs, dimensioned aggregate-forwarding, and operator observability have dedicated deployed smoke scripts.
- Retry and permanent delivery failure behavior works.
- Tenant isolation holds when two workspaces share the same `signal_key`.

Runtime secrets such as Cloudflare API tokens and Slack webhook URLs must be passed through environment variables only. Do not commit them.

## Ownership And License

Heads Up, including the code, documentation, designs, specifications, workflows, and related materials in this repository, is proprietary intellectual property owned by 64 Pixel Holdings LLC and operated by Inc64 LLC.

This repository is not open source. See `LICENSE` for usage restrictions.

## Main Code Paths

- Worker entrypoint: `apps/headsupp-api/src/index.js`
- Node/Cloudflare client wrapper: `packages/headsupp-client`
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

The core API is built, deployed, and operational with local tests, load smoke, deployed smokes, operator bootstrap/auth hardening, audit logging, CI gates, operational health, and runbooks.

Remaining product work should stay story-driven through `stories/README.md`.
