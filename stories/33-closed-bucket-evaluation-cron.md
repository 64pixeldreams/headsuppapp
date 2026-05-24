# Closed Bucket Evaluation Cron_done

## Spec Check

`SPEC_BREIF.md` requires cron every minute to evaluate `AGGREGATE_FORWARD` watches for closed buckets and process retryable alert and aggregate deliveries. The product brief says aggregate-forward emits one clean downstream payload when a bucket closes.

## Scope

- Add scheduled task runner.
- Find active `AGGREGATE_FORWARD` watches.
- Create/enqueue aggregate deliveries for closed buckets.
- Process retryable alert and aggregate deliveries.

## Test Plan

- Unit test closed-bucket aggregate-forward creates delivery.
- Unit test retryable delivery lookup routes work.

## Status

Done.
