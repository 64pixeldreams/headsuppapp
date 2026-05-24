# Aggregate Forward Watch_done

## Spec Check

`SPEC_BREIF.md` defines `AGGREGATE_FORWARD` as the compression use case: when a configured bucket closes, Heads Up sends one aggregate payload to a subscriber and uses `aggregate_deliveries` uniqueness to avoid duplicate forwards.

## Scope

- Build aggregate-forward payloads for closed buckets.
- Persist `aggregate_deliveries` rows with stable ids.
- Enqueue aggregate delivery messages.
- Keep alert delivery separate.

## Out Of Scope

- Actual aggregate delivery dispatch retry internals beyond queue message creation; retry processing is wired in story 33/31 patterns.

## Test Plan

- Unit test payload shape.
- Unit test aggregate delivery row creation.
- Unit test queue message enqueue.

## Status

Done.
