# 92 Dimensioned Aggregate Forward Smoke_done

## Goal

Prove aggregate-forward delivery identity and payloads are dimension-safe on the deployed Worker.

## Requirements

- Add a deployed smoke script that provisions one signal and at least two dimensioned aggregates in the same bucket.
- Configure an `AGGREGATE_FORWARD` watch with a dimension filter.
- Assert one `aggregate_deliveries` row is created for the matching dimension and not for non-matching dimensions.
- Assert payload includes `dimensions_hash`, `dimensions`, dimension-safe `dedupe_key`, safe `fields`, and source `cta` when present.
- Assert a second scheduled pass does not create or send a duplicate for the same subscriber/signal/bucket/dimension.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:aggregate-forward-dimensions
```

## Docs

Update `docs/api/smoke-test-suite.md` and `docs/api/aggregate-forwarding.md`.

## Out Of Scope

Do not forward raw events.
