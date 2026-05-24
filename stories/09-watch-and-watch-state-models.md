# Watch And Watch State Models_done

## Spec Check

Watches decide when a signal deserves attention. Watch state is canonical in D1 and serialized by Durable Objects to avoid duplicate alert decisions.

## Scope

- Represent watches and watch states in D1 schema.
- Support threshold, window, missing expected, digest, and aggregate-forward watch types.
- Preserve cooldown, escalation, recovery, emitted bucket, and digest state.

## Acceptance Criteria

- Watches are workspace/channel/signal scoped.
- Enabled watch indexes support hot-path invocation.
- Watch state includes cooldown and digest fields.

## Test Plan

- Existing watch evaluation, alert decision, missing expected, digest, and WatchEvaluatorDO tests cover behavior.

## Status

Done.
