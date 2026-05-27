# Foretic Pilot Hardening Stories

This batch closes the practical API gaps discovered while planning the first Foretic pace-alerts-by-email pilot.

The goal is not to make Heads Up Foretic-specific. The goal is to make the **generic admin API** safe enough for Foretic and any future customer integration that needs durable provisioning, subscriber status reads, watch lifecycle controls, and a deterministic test-alert path.

## Product Fit

Heads Up remains an API-first attention-processing engine:

```text
connector -> channel -> signal -> aggregate -> watch -> alert or forward
```

These stories improve the control plane around that engine. They do not add a dashboard, BI views, billing, raw event search, or a full app.

## Build Order

Build in numeric order unless a dependency requires otherwise.

```text
01 Generic resource lookup APIs
02 Idempotent admin provisioning semantics
03 Subscriber read and email authorization status APIs
04 Watch update disable and cleanup API
05 Test alert delivery API
06 Foretic pilot integration docs and smoke
```

## Pilot Risk Mapping

| Risk | Story |
|------|-------|
| Foretic must persist IDs and cannot blindly recreate resources | 01, 02 |
| No recovery lookup by external forecast ID | 01 |
| No subscriber read/list API for email confirmation status | 03 |
| No permanent watch cleanup API | 04 |
| No test-email bypass | 05 |
| Need a clear Foretic email-first pilot contract | 06 |

## Deferred

These are intentionally out of scope for this batch:

```text
Dashboard UI
Billing or usage metering
Raw event detail ledger
Generic visual watch builder
Foretic app code changes
```

## Execution

Follow [docs/story-execution.md](../../docs/story-execution.md). Each story that changes API behavior must update [docs/api/](../../docs/api/README.md), SDK docs if relevant, and tests.

Run from `apps/headsupp-api`:

```bash
npm run check
```

## Per-Story Requirements

Every story in this batch must include:

```text
tests
  Unit tests for core behavior and negative/tenant-scope cases.
  Integration or smoke coverage when the behavior crosses API, queues, delivery, or SDK boundaries.

main API docs
  Update docs/api/reference.md and docs/api/admin.md for every new/changed action.
  Update specialized docs such as subscribers, email-subscribers, watch-types, connectors-and-ingest, or smoke-test-suite when touched.

SDK docs
  Update packages/headsupp-client docs and docs/public-sdk when examples, wrappers, or public response shapes change.
  Mirror equivalent changes to headsuppclientsdk docs before publishing SDK-facing guidance.
```

Do not mark a story done if it changes integration behavior without tests and both doc surfaces reviewed.
