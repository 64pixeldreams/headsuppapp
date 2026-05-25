# 94 Deployed Advanced Watch Smoke

## Goal

Prove `WINDOW_*` and `DELTA_*` watch behavior on the deployed Worker.

## Requirements

- Add a deployed smoke script with deterministic resources and cleanup.
- Exercise at least one `WINDOW_AVG_LT` or `WINDOW_AVG_GT` watch.
- Exercise at least one `DELTA_LT` or `DELTA_GT` watch.
- Assert normal inputs remain quiet when below trigger conditions.
- Assert trigger inputs create expected alert rows and deliveries.
- Assert watch state records recent evaluation timestamps for quiet and triggered outcomes.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:advanced-watches
```

## Docs

Update `docs/api/smoke-test-suite.md`, `docs/api/reference.md`, and `docs/api/cursor-api-instructions.md`.

## Out Of Scope

Do not add ML/anomaly detection.
