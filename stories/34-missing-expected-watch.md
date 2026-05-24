# Missing Expected Watch_done

## Spec Check

`SPEC_BREIF.md` says `MISSING_EXPECTED` is evaluated only by scheduled jobs and must not depend on ingest timing. The product brief requires one missing update/payment alert without constant repeats.

## Scope

- Evaluate active `MISSING_EXPECTED` watches from cron.
- Query aggregate counts in the expected window plus grace.
- Persist one alert/delivery path through existing alert persistence.

## Test Plan

- Unit test missing expected triggers.
- Unit test present aggregate does not trigger.

## Status

Done.
