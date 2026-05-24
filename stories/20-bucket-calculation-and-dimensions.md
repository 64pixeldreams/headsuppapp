# Bucket Calculation And Dimensions_done

## Spec Check

`SPEC_BREIF.md` requires v1 bucket types `minute`, `hour`, `day`, and `month`; each event updates every bucket configured by the signal contract. Contracts can define dimensions like `forecast_id` and `status`.

## Scope

- Calculate UTC bucket starts for minute/hour/day/month.
- Extract configured dimensions from event fields.
- Build aggregate deltas for every configured bucket.

## Test Plan

- Unit test bucket starts.
- Unit test dimension extraction.
- Unit test event-to-delta conversion.

## Status

Done.
