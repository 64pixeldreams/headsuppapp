# Heads Up Value And Use Cases

Use this guide to understand what Heads Up is for in real apps.

Primary docs:
- [Quickstart](quickstart.md)
- [Reference](reference.md)
- [Watch types](watch-types.md)

## What Heads Up Is Best At

Heads Up is an attention-processing API that:
- ingests high-volume events,
- aggregates them into buckets,
- evaluates watches on aggregate state,
- stays quiet by default,
- sends callbacks only when a condition is earned.

If your app has too many events and not enough useful decisions, this is where Heads Up adds value.

## Real-World API Use Cases (Shipped)

## 1) Spend Guardrails

Business question: "Are we overspending this week?"

- Watch type: `WINDOW_SUM_GT`
- Example: weekly coffee spend over $50
- Signal: `spend.coffee.usd`
- Read in callback: `current_value`, `threshold_value`, `watch_id`, `channel_metadata`

Example watch config:

```json
{
  "watch_type": "WINDOW_SUM_GT",
  "config": {
    "threshold": 50,
    "severity": "warning",
    "bucket_type": "week",
    "window": { "size": 1 }
  }
}
```

For individual purchase alerts, avoid emailing on every qualifying purchase unless that is explicitly wanted. Use `cooldown_seconds` for "at most once per day/week", or prefer the weekly `WINDOW_SUM_GT` pattern when the user cares about total spend.

## 2) "Most Expensive Purchase This Week"

Business question: "What was the highest transaction this week?"

- Pattern: `AGGREGATE_FORWARD` (weekly bucket)
- Why: there is no `WINDOW_MAX_GT` alert watch type; closed-bucket aggregate payload exposes `values.max`
- Read in callback: `values.max`

Example watch config:

```json
{
  "watch_type": "AGGREGATE_FORWARD",
  "config": {
    "bucket_type": "week",
    "emit_after_grace_seconds": 60,
    "subscriber_id": "sub_forward",
    "include": {
      "max": true,
      "sum": true,
      "count": true,
      "avg": true,
      "min": true,
      "last": true
    }
  }
}
```

## 3) "No Purchases Happened This Week"

Business question: "Tell me when expected activity did not happen."

- Watch type: `MISSING_EXPECTED`
- Why: evaluates absence of expected events on schedule
- Read in callback: `watch_id`, `summary`, `channel_metadata`

Example watch config:

```json
{
  "watch_type": "MISSING_EXPECTED",
  "config": {
    "bucket_type": "week",
    "minimum_count": 1,
    "grace_seconds": 3600,
    "severity": "warning"
  }
}
```

## 4) Pace And Health State Changes

Business question: "Tell me only when status gets meaningfully worse or recovers."

- Watch types: `LAST_VALUE_LT`, `LAST_VALUE_GT` with cooldown + recovery
- Read in callback: `severity`, `current_value`, `watch_id`

## 5) Sudden Usage Spikes

Business question: "Did usage suddenly double?"

- Watch types: `PREVIOUS_PERIOD_RATIO_GT`, `PERCENT_CHANGE_GT`, `SPIKE_GT`
- Read in callback: `current_value`, `threshold_value`, `watch_id`

Market-price style use cases usually belong here. A raw `LAST_VALUE_GT` watch can be noisy because every tick above the threshold may qualify after cooldown. Use percent-change or spike watches when the user wants meaningful movement, and add recovery/cooldown when the user wants "tell me once until it settles".

## 5b) Trend Is Going Up Or Down

Business question: "Are website form views, checkout views, or market prices trending up or down over a useful window?"

- Watch types: `TREND_UP_GT`, `TREND_DOWN_GT`
- Read in callback: `current_value` as trend percent, `fields.trend.first_value`, `fields.trend.latest_value`, `fields.trend.window_size`

Website views example:

```json
{
  "watch_type": "TREND_UP_GT",
  "config": {
    "threshold": 10,
    "severity": "warning",
    "bucket_type": "day",
    "window": { "size": 7 },
    "field": "last_value"
  }
}
```

This can power copy such as "Your form views are trending up 18% over the last 7 days." Use `TREND_DOWN_GT` for "views are trending down" alerts.

Market feed example:

```json
{
  "watch_type": "TREND_DOWN_GT",
  "config": {
    "threshold": 5,
    "severity": "warning",
    "bucket_type": "day",
    "window": { "size": 3 },
    "field": "last_value"
  }
}
```

## Choosing Notification Behavior

Use this decision guide:

```text
I want to know total spend this week
  Use WINDOW_SUM_GT with bucket_type = week.

I want to know about one unusually expensive purchase
  Use LAST_VALUE_GT with a long cooldown_seconds.

I want to know when a market price moves sharply
  Use PERCENT_CHANGE_GT, PERCENT_CHANGE_LT, or SPIKE_GT.

I want to know if form views or market price are trending up/down
  Use TREND_UP_GT or TREND_DOWN_GT over day/hour buckets.

I want one alert and then silence until normal again
  Use recovery + renotify_policy = once_until_recovered.

I want to pause alerts after the user complains
  Use admin.snoozeWatch or admin.muteWatch.
```

## 6) Recurring Summaries Instead Of Noise

Business question: "Give me periodic context, not constant alerts."

- Watch type: `DIGEST`
- Complement: `quiet_summary` subscriber mode
- Read in callbacks: digest fields or quiet summary watch-state timestamps

## 7) Aggregate Gateway For Downstream Systems

Business question: "Can we forward clean aggregates instead of raw event firehose?"

- Pattern: `AGGREGATE_FORWARD`
- Read in callback: `bucket`, `values`, `dimensions`, `dedupe_key`, `delivery_id`

This is useful when a downstream app wants hourly, daily, weekly, or monthly summaries and not raw events. See [aggregate-forwarding.md](aggregate-forwarding.md) for bucket sizes, payload examples, responses, signing headers, and retry behavior.

## Website Claims -> API Capability Mapping

What [headsupp.io](https://headsupp.io) says and how API implements it:

- "Aggregation-first" -> aggregate tables + watch evaluation on aggregate state.
- "Silence is default" -> cooldown/escalation/recovery + quiet summary modes.
- "Absence detection" -> `MISSING_EXPECTED`.
- "Channel-centric" -> workspace/channel/signal/watch/subscriber model.
- "Finance, revenue, ops, growth use cases" -> supported watch families in [watch-types.md](watch-types.md).
- "API & webhooks at scale" -> signed ingest + queue-based async pipeline + retrying webhook delivery.

## Reality Check (Shipped vs Not Yet)

Shipped now in core API:
- Signed webhook ingest.
- Aggregate-first watch evaluation.
- Alert webhooks.
- Aggregate-forward callbacks.
- Quiet-summary callbacks.
- Read APIs and watch/action controls.

Not currently in shipped core API scope:
- Email-forwarding connector flow as a built connector surface.
- Slack OAuth app flow (Slack incoming webhook payload delivery is supported).

Use this split when discussing value so docs stay accurate and non-hallucinated.

## Suggested Start Path

1. [Quickstart](quickstart.md) to run end-to-end.
2. [Use cases](use-cases.md) to choose your watch pattern.
3. [Reference](reference.md) to wire exact props and payload fields.
