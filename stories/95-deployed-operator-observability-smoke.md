# 95 Deployed Operator Observability Smoke_done

## Goal

Prove operator key lifecycle and observability overview behavior on the deployed Worker.

## Requirements

- Add a deployed smoke script that uses runtime-only operator/bootstrap credentials.
- Bootstrap a short-lived service API key.
- List, rotate, and revoke the service API key without exposing raw key material after creation.
- Read audit logs with `audit:read`.
- Call `/api/v1/observability/overview` with operator authentication.
- Assert responses redact secrets, raw event bodies, webhook destinations, and connector secrets.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:operator-observability
```

## Docs

Update `docs/api/smoke-test-suite.md`, `docs/api/authentication.md`, and `docs/api/observability.md`.

## Out Of Scope

Do not build a dashboard.
