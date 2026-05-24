# Dedupe Cleanup Cron_done

## Spec Check

`SPEC_BREIF.md` says raw dedupe should be retained for 24-72 hours in the MVP and old rows should be deleted by scheduled cleanup.

## Scope

- Delete `raw_event_dedupe` rows older than configured retention.
- Run cleanup from scheduled tasks.

## Test Plan

- Unit test cutoff timestamp.
- Unit test delete SQL.

## Status

Done.
