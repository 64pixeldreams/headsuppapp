# Atomic Aggregate Upsert_done

## Spec Check

`SPEC_BREIF.md` explicitly forbids select-then-update aggregate arithmetic and requires a single SQL upsert per aggregate delta with atomic increments on conflict.

## Scope

- Add aggregate upsert SQL helper.
- Use `ON CONFLICT(signal_id, bucket_type, bucket_start_at) DO UPDATE`.
- Increment sum/count atomically and update min/max/last/avg in SQL.

## Test Plan

- Unit test SQL includes atomic conflict clause.
- Unit test bound parameters match aggregate delta values.

## Status

Done.
