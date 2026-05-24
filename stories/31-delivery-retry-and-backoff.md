# Delivery Retry And Backoff_done

## Spec Check

`SPEC_BREIF.md` requires retry on 429/5xx/network errors, permanent failure on 400/401/403/404, and backoff of immediate, +1 minute, +5 minutes, +15 minutes, +1 hour, +6 hours, then failed.

## Scope

- Calculate retry/fail/sent delivery states.
- Update delivery attempt count and next retry timestamp.
- Add alert delivery queue consumer boundary.

## Test Plan

- Unit test 2xx sent.
- Unit test 429/5xx retry backoff.
- Unit test permanent 4xx failure.
- Unit test max attempts failure.

## Status

Done.
