# Load Tests And Stress Tests_done

## Spec Check

The product brief lists five stress requirements: 10,000 batched connector events, 1,000 events/minute for one signal, duplicate retry dedupe, concurrent workers with atomic upsert, and 24-hour forecast pace transitions without alert spam.

## Scope

- Add local synthetic load helpers.
- Add a lightweight smoke script that validates batching, folding, and dedupe assumptions.
- Document how to run the stress harness.

## Test Plan

- Unit test generated event counts.
- Unit test smoke summary invariants.
- Run `npm run load:smoke`.

## Status

Done.
