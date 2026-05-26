# Trend Watch Types Over Aggregates

## User Story

As an integrator, I need Heads Up to detect whether a metric is trending up or down across a time window so noisy feeds like website views or market prices become useful alerts.

## Product Fit

This is core Heads Up behavior: reduce many events into a meaningful signal. Examples:

```text
Website analytics
  "Your form views are trending up over the last 7 days."
  "Your checkout views are trending down over the last 3 days."

Market feed
  "Price trend is up 6.2% over the last day."
  "Price trend is down 4.1% over the last week."
```

This should be watch logic over existing aggregate buckets first, not a new raw-event analysis path.

## Scope

- Add trend watch types:

```text
TREND_UP_GT
TREND_DOWN_GT
```

- Evaluate trends from existing aggregate rows using `bucket_type` and `window.size`.
- Support fields:

```json
{
  "watch_type": "TREND_UP_GT",
  "config": {
    "bucket_type": "day",
    "window": { "size": 7 },
    "field": "last_value",
    "method": "first_last_percent_change",
    "threshold": 10,
    "severity": "warning"
  }
}
```

- MVP method:

```text
first_last_percent_change = ((latest - first) / abs(first)) * 100
```

- `TREND_UP_GT` triggers when trend percent is greater than `threshold`.
- `TREND_DOWN_GT` triggers when trend percent is less than `-threshold`.
- Return `current_value` as the trend percentage so formatting can render `%`.
- Keep `linear_regression` out of MVP unless explicitly requested later.

## Window Examples

```text
3-day trend
  bucket_type = day
  window.size = 3

7-day / 1-week trend
  bucket_type = day
  window.size = 7

30-day / 1-month trend
  bucket_type = day
  window.size = 30

Calendar month trend
  bucket_type = month
  window.size = 1
  Useful for closed monthly aggregate comparisons, but not the first MVP path.
```

## Platform Alignment

- Extend `evaluate-watch.js` watch type support.
- Reuse existing aggregate loading in the watch evaluator.
- Do not add new D1 trend tables for MVP.
- Do not inspect raw events directly.
- Preserve existing `PERCENT_CHANGE_*`, `DELTA_*`, and `SPIKE_GT` behavior.
- Use existing cooldown, recovery, renotify, snooze, and mute controls after trend decision.

## Acceptance Criteria

- `TREND_UP_GT` triggers for a clear upward multi-bucket trend.
- `TREND_DOWN_GT` triggers for a clear downward multi-bucket trend.
- Flat/insufficient data stays quiet with a stable reason.
- Zero or invalid first value is handled safely without divide-by-zero behavior.
- Trend result includes enough context for email/webhook payloads and docs:
  - first value,
  - latest value,
  - trend percent,
  - bucket type,
  - window size.
- Website views and market feed examples are documented.

## Test Plan

- Unit tests in watch evaluator for:
  - upward trend trigger,
  - downward trend trigger,
  - flat trend no trigger,
  - insufficient buckets no trigger,
  - first value zero no trigger/safe reason,
  - threshold equality behavior.
- Existing watch regression tests still pass.
- Add deployed or local smoke coverage using website form views or market feed fixtures.
- Run `npm run check` from `apps/headsupp-api`.

## API Documentation

- Update `docs/api/watch-types.md` with trend watch types and examples.
- Update `docs/api/reference.md` supported watch list.
- Update `docs/api/use-cases.md` with:
  - website form views trending up/down,
  - market feed trending up/down.
- Update SDK docs/readmes with `createWatch` examples.

## Done Definition

- Trend watches are explainable, useful, documented, and covered by tests.
- The implementation stays on the aggregate path and does not add premature trend storage.

## Cursor Rules And Proof Gates

- Follow `cursor.js`: keep evaluator changes focused, write tests, update docs with every watch type change, preserve tenant boundaries, and run `npm run check`.
- Avoid broad refactors or speculative trend engines.

## Status

Done.
