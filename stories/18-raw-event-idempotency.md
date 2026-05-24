# Raw Event Idempotency_done

## Spec Check

`SPEC_BREIF.md` requires inserting into `raw_event_dedupe` before aggregate updates. If the key already exists, the consumer must acknowledge the message and skip aggregate/watch work. If a producer omits a key, Heads Up generates one from connector id, signal key, occurred time, and payload hash.

## Scope

- Generate deterministic idempotency keys when missing.
- Insert dedupe rows with `INSERT OR IGNORE`.
- Return duplicate status based on D1 changes.
- Keep aggregation and watch invocation skipped for duplicates.

## Test Plan

- Unit test client-provided key.
- Unit test generated key.
- Unit test duplicate skip.
- Consumer tests in later stories assert duplicates do not fold aggregates.

## Status

Done.
