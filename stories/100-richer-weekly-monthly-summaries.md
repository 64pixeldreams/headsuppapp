# 100 Richer Weekly Monthly Summaries_done

## Goal

Extend digest summaries beyond one latest aggregate so channels can emit weekly or monthly multi-signal summaries.

## Requirements

- Support weekly and monthly digest schedules.
- Allow digest config to include multiple signals.
- Build summary payloads from aggregate rows over the selected period.
- Keep quiet summaries separate from richer digest summaries.
- Preserve existing daily/hourly digest behavior.

## Acceptance Criteria

- Daily/hourly digest tests remain valid.
- Weekly and monthly digest configs select aggregate rows in the expected period.
- Multi-signal summaries include each signal with sum/count/avg/min/max/last values.
- Alert payloads include structured summary fields for webhook consumers.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
```

## Docs

Update `docs/api/reference.md`, `docs/api/quickstart.md`, and `docs/api/aggregate-forwarding.md` if summary payload examples overlap forwarding examples.

## Out Of Scope

Do not build report rendering or dashboard views.
