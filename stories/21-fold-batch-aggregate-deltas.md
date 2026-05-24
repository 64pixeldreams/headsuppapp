# Fold Batch Aggregate Deltas_done

## Spec Check

`SPEC_BREIF.md` says the queue consumer converts events to aggregate deltas, then groups/folds by `workspace_id`, `channel_id`, `signal_id`, `bucket_type`, and `bucket_start_at` before writing to D1.

## Scope

- Fold multiple deltas for the same aggregate bucket.
- Preserve sum/count/min/max/avg/last/first timestamps.
- Ensure only folded deltas are passed to upsert.

## Test Plan

- Unit test same-bucket folding.
- Unit test separate buckets stay separate.

## Status

Done.
