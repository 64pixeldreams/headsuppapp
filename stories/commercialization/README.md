# Commercialization Stories

Thin go-to-market layer for Heads Up: **customer account signup**, **self-serve service API keys**, **public domains**, and **published developer docs**.

This is **not** a dashboard product. Do not add watch builders, alert inboxes, charts, raw event search, billing checkout, or full subscriber management UI in this batch.

## Product Fit (No Drift)

Heads Up remains an **attention-processing API**:

```text
connector -> channel -> signal -> aggregate -> watch -> alert or forward
```

Commercialization stories only change **how customers get credentials and documentation**. All provisioning after signup still uses the existing admin API, SDK, and docs — not a new product surface.

## Build Order

Build in numeric order unless a dependency note says otherwise.

```text
01 Public domains and worker routes
02 Public docs site and sync pipeline
03 Customer account signup and session
04 Self-serve service API keys
05 Minimal account portal (signup, login, API keys only)
06 Customer onboarding documentation
```

## Deferred (Separate Batch Later)

Do not implement in this folder unless a new story explicitly expands scope:

```text
Usage metering and plan limits
Stripe or billing provider integration
Event detail ledger / purchase drill-down
Full dashboard or watch/subscriber UI
```

## Story Files

| File | Goal |
|------|------|
| [01-public-domains-and-worker-routes.md](01-public-domains-and-worker-routes.md) | `api.headsupp.io`, `app.headsupp.io`, `docs.headsupp.io` |
| [02-public-docs-site-and-sync.md](02-public-docs-site-and-sync.md) | Curated public docs deploy from private source |
| [03-customer-account-signup-and-session.md](03-customer-account-signup-and-session.md) | Signup, login, session, default workspace |
| [04-self-serve-service-api-keys.md](04-self-serve-service-api-keys.md) | Customer-owned key create/list/revoke/rotate |
| [05-minimal-account-portal.md](05-minimal-account-portal.md) | Three-page portal only (no dashboard features) |
| [06-customer-onboarding-documentation.md](06-customer-onboarding-documentation.md) | End-user docs for account, keys, base URL, SDK |

## Execution

Follow [docs/story-execution.md](../../docs/story-execution.md) and [docs/cursor-build-loop.md](../../docs/cursor-build-loop.md).

After each story:

```bash
cd apps/headsupp-api
npm run check
```

Update `docs/api/` when control-plane auth or actions change. Update `docs/public-sdk/` and run `scripts/sync-public-sdk-docs.mjs` when customer-facing SDK docs change.
