# Watch Evaluator Durable Object_done

## Spec Check

The spec requires one Durable Object per watch for serialized watch evaluation state. Durable Objects should coordinate alert decisions, not process every raw event.

## Scope

- Export `WatchEvaluatorDO` from the Worker.
- Accept POST evaluation requests.
- Delegate evaluation to `evaluateWatchRequest`.
- Keep D1 as canonical state and the Durable Object as serialized coordinator.

## Acceptance Criteria

- Raw aggregation invokes `WATCH_EVALUATOR.idFromName(watchId)`.
- DO loads watch/state/aggregates, evaluates, applies cooldown/escalation/recovery, persists alert/delivery state, and enqueues alert delivery messages.
- DO is not used for every raw event.

## API Docs

Documented in `docs/api/connectors-and-ingest.md`.

## Test Plan

- Existing watch invocation and watch evaluator tests cover the DO flow.

## Status

Done.
