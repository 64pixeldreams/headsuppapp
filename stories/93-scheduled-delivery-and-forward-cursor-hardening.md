# 93 Scheduled Delivery And Forward Cursor Hardening

## Goal

Close the scheduled-runtime risks found during the platform alignment audit.

## Requirements

- Ensure `MISSING_EXPECTED` and `DIGEST` scheduled alerts enqueue alert-delivery messages when alert deliveries are created.
- Add tests proving scheduled alert deliveries do not remain pending indefinitely when a queue binding exists.
- Add an emitted cursor or queue-send guard for `AGGREGATE_FORWARD` so cron does not repeatedly enqueue an already-created aggregate delivery ID.
- Use existing `last_emitted_bucket_start_at` or an equivalent durable state field if it fits the current schema.
- Preserve `INSERT OR IGNORE` duplicate protection for delivery rows.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run smoke:scheduled
```

## Docs

Update `docs/api/aggregate-forwarding.md`, `docs/api/smoke-test-suite.md`, and `docs/api/spec-alignment-audit.md`.

## Out Of Scope

Do not add AI, email, dashboards, or per-event forwarding.
