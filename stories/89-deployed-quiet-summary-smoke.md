# 89 Deployed Quiet Summary Smoke

## Goal

Prove quiet-summary delivery on the deployed Worker without creating normal alert rows.

## Requirements

- Add a deployed smoke script that provisions deterministic quiet-summary resources.
- Create or reuse a quiet-summary subscriber with `mode: "quiet_summary"`.
- Ensure at least one watch has a recent quiet `watch_states.last_evaluated_at`.
- Trigger or invoke the scheduled quiet-summary path.
- Assert a `quiet_summary_deliveries` row is created and delivered or safely marked according to the configured receiver.
- Assert no normal alert row is created by quiet-summary generation.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:quiet-summary
```

## Docs

Update `docs/api/smoke-test-suite.md` and `docs/api/alerts-and-deliveries.md`.

## Out Of Scope

Do not add email or AI behavior.
