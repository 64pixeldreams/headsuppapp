# Worker Project Scaffold_done

## Spec Check

The product is a Cloudflare Workers API, not a dashboard. The worker must expose health checks, CFKit CloudFunction dispatch for control-plane operations, ingest routing, queue consumers, Durable Object export, and scheduled cron handling.

## Scope

- Worker app lives in `apps/headsupp-api`.
- Entrypoint is `src/index.js`.
- CFKit handles control-plane function dispatch and logging.
- Direct Worker handlers are used for hot-path ingest, queues, Durable Objects, and cron.

## Acceptance Criteria

- Health endpoints respond.
- `/api/function` dispatches CFKit functions.
- Worker exports `WatchEvaluatorDO`.
- Queue and scheduled handlers exist.

## Test Plan

- Integration scaffold tests cover health and CFKit dispatch.

## Status

Done.
