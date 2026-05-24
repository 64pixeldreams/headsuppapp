# Invoke Watch Evaluator_done

## Spec Check

`SPEC_BREIF.md` says after atomic aggregate upserts, the consumer invokes `WatchEvaluatorDO` for affected signal/watch pairs using deterministic `env.WATCH_EVALUATOR.idFromName(watchId)`. The DO serializes per-watch state transitions, but full evaluation flow is later work.

## Scope

- Add helper to load active watches for affected signals.
- Invoke `WATCH_EVALUATOR` with `aggregate_updated` inputs.
- Add queue consumer orchestration for stories 18-23.
- Keep the DO as an invocation boundary, not full alert evaluation.

## Out Of Scope

- Cooldowns, alert creation, delivery queueing, and actual watch state transitions.

## Test Plan

- Unit test watch evaluator invocation payloads.
- Unit test queue consumer skips duplicates and invokes watches after upsert.

## Status

Done.
