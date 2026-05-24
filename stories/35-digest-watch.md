# Digest Watch_done

## Spec Check

`SPEC_BREIF.md` defines `DIGEST` as a scheduled summary with schedule/time/include config. The product brief allows digest notifications as one of the explicit silence exceptions.

## Scope

- Evaluate due `DIGEST` watches from cron.
- Create summary alert payloads.
- Update `last_digest_at` through watch state.

## Test Plan

- Unit test due digest creates alert.
- Unit test recent digest is skipped.

## Status

Done.
