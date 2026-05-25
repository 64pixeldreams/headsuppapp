# 96 Week Bucket Support_done

## Goal

Support weekly aggregate buckets so API users can model weekly spend and weekly activity rules without approximating calendar weeks through daily or rolling windows.

## Requirements

- Add `week` as a supported aggregate bucket type.
- Use a deterministic UTC week boundary.
- Preserve existing `minute`, `hour`, `day`, and `month` behavior.
- Ensure event-to-aggregate deltas can emit week buckets when a signal contract enables them.
- Document weekly spend examples.

## Acceptance Criteria

- A Sunday event and following Monday event fall into the expected UTC week buckets.
- A signal contract with `default_bucket_types: ["week"]` emits a week aggregate delta.
- Unsupported bucket types still fail clearly.

## Proof Gates

```bash
cd apps/headsupp-api
npm run check
npm run load:smoke
```

## Docs

Update `docs/api/quickstart.md`, `docs/api/reference.md`, and `docs/api/schema-and-migrations.md` if bucket documentation changes.

## Out Of Scope

Do not add calendar/timezone preferences in this story.
