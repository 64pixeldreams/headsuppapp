# Aggregate Dedupe Alert Delivery Models_done

## Spec Check

Aggregates are the core compressed signal store. Raw dedupe prevents duplicate updates, alerts persist before delivery, and aggregate deliveries are unique per subscriber/signal/bucket.

## Scope

- Represent aggregates, raw event dedupe, alerts, alert deliveries, and aggregate deliveries in D1 schema.
- Preserve atomic aggregate upsert and retryable delivery state.

## Acceptance Criteria

- Aggregate uniqueness constraint exists.
- Raw dedupe cleanup index exists.
- Alert and aggregate delivery retry indexes/constraints exist.
- Delivery state supports `pending`, `sent`, `retrying`, and `failed`.

## Test Plan

- Existing aggregate upsert, raw idempotency, alert persistence, delivery, scheduler, and aggregate-forward tests cover these models.

## Status

Done.
