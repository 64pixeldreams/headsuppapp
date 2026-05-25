# Watch Types And Features

Primary docs: use [quickstart.md](quickstart.md) for setup flow and [reference.md](reference.md) for canonical action/callback props. This file helps choose the right watch behavior.

For scenario-first guidance, use [use-cases.md](use-cases.md).

This guide explains what Heads Up can do after events are aggregated.

Heads Up watches evaluate aggregate rows, not individual raw events. Most watch configs use:

```json
{
  "threshold": 10,
  "severity": "warning",
  "bucket_type": "minute"
}
```

Supported bucket types:

```text
minute
hour
day
week
month
```

Week buckets use UTC Monday boundaries.

## Quick Chooser

```text
Latest value above/below a threshold     LAST_VALUE_GT / LAST_VALUE_LT
Total in a period                        WINDOW_SUM_GT
Average over recent buckets              WINDOW_AVG_GT / WINDOW_AVG_LT
Number of events in a period             WINDOW_COUNT_GT
Absolute change from previous bucket      DELTA_GT / DELTA_LT
Percent change from previous bucket       PERCENT_CHANGE_GT / PERCENT_CHANGE_LT
Previous-period ratio                     PREVIOUS_PERIOD_RATIO_GT / PREVIOUS_PERIOD_RATIO_LT
Spike in percent terms                    SPIKE_GT
Expected event did not happen             MISSING_EXPECTED
Calendar due-date reminder                REMINDER_DUE
Scheduled rollup alert                    DIGEST
Forward a closed aggregate bucket         AGGREGATE_FORWARD
```

There is no `WINDOW_MAX_GT` watch type. If you need the highest value in a closed bucket, use `AGGREGATE_FORWARD` and read `values.max`, or model a spike/threshold watch depending on the product need.

## Watch Type Index

Use these stable anchors when linking from references and SDK docs.

### LAST_VALUE_GT

See [Latest Value Threshold](#latest-value-threshold).

### LAST_VALUE_LT

See [Latest Value Threshold](#latest-value-threshold).

### WINDOW_SUM_GT

See [Total In A Period](#total-in-a-period).

### WINDOW_AVG_GT

See [Average Over A Window](#average-over-a-window).

### WINDOW_AVG_LT

See [Average Over A Window](#average-over-a-window).

### WINDOW_COUNT_GT

See [Count In A Period](#count-in-a-period).

### DELTA_GT

See [Absolute Delta](#absolute-delta).

### DELTA_LT

See [Absolute Delta](#absolute-delta).

### PERCENT_CHANGE_GT

See [Percent Change And Ratio](#percent-change-and-ratio).

### PERCENT_CHANGE_LT

See [Percent Change And Ratio](#percent-change-and-ratio).

### PREVIOUS_PERIOD_RATIO_GT

See [Percent Change And Ratio](#percent-change-and-ratio).

### PREVIOUS_PERIOD_RATIO_LT

See [Percent Change And Ratio](#percent-change-and-ratio).

### SPIKE_GT

See [Percent Change And Ratio](#percent-change-and-ratio).

### MISSING_EXPECTED

See [Missing Expected](#missing-expected).

### REMINDER_DUE

See [Due-Date Reminder](#due-date-reminder).

### DIGEST

See [Digest](#digest).

### AGGREGATE_FORWARD

See [Aggregate Forward](#aggregate-forward).

## Latest Value Threshold

Use this when the most recent value matters.

Example: alert when a metric is greater than 10.

```json
{
  "watch_type": "LAST_VALUE_GT",
  "config": {
    "threshold": 10,
    "severity": "warning",
    "bucket_type": "minute"
  },
  "cooldown_seconds": 3600
}
```

Use `LAST_VALUE_LT` for “below threshold”, such as forecast pace below 85.

Optional recovery:

```json
{
  "recovery": {
    "enabled": true,
    "condition": "value >= 95",
    "severity": "recovery"
  }
}
```

Recovery only fires after the watch previously triggered.

## Total In A Period

Use `WINDOW_SUM_GT` when you care about total spend, total usage, total revenue, or total errors over one or more buckets.

Example: alert if weekly spend goes over 500.

```json
{
  "watch_type": "WINDOW_SUM_GT",
  "config": {
    "threshold": 500,
    "severity": "warning",
    "bucket_type": "week",
    "window": {
      "size": 1
    }
  }
}
```

`window.size` is the number of buckets to include. A weekly bucket with size `1` means the current week bucket. An hourly bucket with size `24` means the last 24 hourly buckets ending at the triggering bucket.

## Average Over A Window

Use `WINDOW_AVG_GT` or `WINDOW_AVG_LT` when short spikes should be smoothed.

Example: alert if average latency across the last 3 minute buckets exceeds 250.

```json
{
  "watch_type": "WINDOW_AVG_GT",
  "config": {
    "threshold": 250,
    "severity": "warning",
    "bucket_type": "minute",
    "window": {
      "size": 3
    }
  }
}
```

## Count In A Period

Use `WINDOW_COUNT_GT` when the number of events matters.

Example: alert if more than 100 failures arrive in an hour.

```json
{
  "watch_type": "WINDOW_COUNT_GT",
  "config": {
    "threshold": 100,
    "severity": "critical",
    "bucket_type": "hour",
    "window": {
      "size": 1
    }
  }
}
```

## Absolute Delta

Use `DELTA_GT` or `DELTA_LT` to compare the latest bucket value to the previous bucket value.

Example: alert if a metric increases by more than 20 between minute buckets.

```json
{
  "watch_type": "DELTA_GT",
  "config": {
    "threshold": 20,
    "severity": "warning",
    "bucket_type": "minute"
  }
}
```

`DELTA_LT` is useful for drops, such as a forecast pace falling by more than 5 points.

Delta watches need at least two adjacent aggregate rows.

## Percent Change And Ratio

Use percent change when users think in “up 50%” or “down 25%”.

```json
{
  "watch_type": "PERCENT_CHANGE_GT",
  "config": {
    "threshold": 50,
    "severity": "warning",
    "bucket_type": "hour"
  }
}
```

Use ratio when users think in multipliers.

```json
{
  "watch_type": "PREVIOUS_PERIOD_RATIO_GT",
  "config": {
    "threshold": 2,
    "severity": "warning",
    "bucket_type": "hour"
  }
}
```

`threshold: 2` means the latest value is at least double the previous bucket value.

`SPIKE_GT` is a percent-increase watch. Use it when “spike” is clearer for the user:

```json
{
  "watch_type": "SPIKE_GT",
  "config": {
    "threshold": 100,
    "severity": "critical",
    "bucket_type": "minute"
  }
}
```

Relative-change watches need two adjacent buckets and do not trigger when the previous value is zero.

## Missing Expected

Use `MISSING_EXPECTED` when something should arrive and does not.

Simple heartbeat example:

```json
{
  "watch_type": "MISSING_EXPECTED",
  "config": {
    "expected_every": {
      "unit": "hour",
      "count": 3
    },
    "grace_seconds": 900,
    "minimum_count": 1,
    "bucket_type": "hour",
    "severity": "warning"
  }
}
```

Value-range expectation example:

```json
{
  "watch_type": "MISSING_EXPECTED",
  "config": {
    "bucket_type": "day",
    "due_window": {
      "start_at": "2026-05-25T00:00:00.000Z",
      "end_at": "2026-05-26T00:00:00.000Z"
    },
    "minimum_count": 1,
    "value_range": {
      "field": "sum",
      "min": 100,
      "max": 200
    },
    "severity": "warning"
  }
}
```

Dimension-scoped expectation:

```json
{
  "dimensions": {
    "vendor": "openai"
  }
}
```

Current behavior relies on cooldown to avoid repeated alerts. Per-cycle fulfilled state and skip windows are future scope.

## Due-Date Reminder

Use `REMINDER_DUE` for renewals or deadlines.

```json
{
  "watch_type": "REMINDER_DUE",
  "config": {
    "due_at": "2026-06-01T00:00:00.000Z",
    "lead": {
      "unit": "day",
      "count": 7
    },
    "expires_after_seconds": 7200,
    "severity": "warning",
    "label": "OpenAI renewal",
    "cta": {
      "label": "Review renewal",
      "url": "https://example.com/renewals/openai"
    }
  }
}
```

The watch still belongs to a signal row because that is the current API shape, but reminder evaluation is time-based.

## Digest

Use `DIGEST` for scheduled summaries.

```json
{
  "watch_type": "DIGEST",
  "config": {
    "schedule": "weekly",
    "signal_ids": ["sig_revenue", "sig_churn"],
    "include": ["sum", "count", "avg", "last"],
    "severity": "info"
  }
}
```

Schedules:

```text
hourly
daily
weekly
monthly
```

Digest creates an alert row and alert delivery. Quiet summaries are different: they create `quiet_summary_deliveries` and do not create alert rows.

## Aggregate Forward

Use `AGGREGATE_FORWARD` when another system should receive closed aggregate buckets instead of alert messages.

First create a subscriber with `mode: "aggregate_forward"`, then create a watch:

```json
{
  "watch_type": "AGGREGATE_FORWARD",
  "config": {
    "bucket_type": "hour",
    "emit_after_grace_seconds": 60,
    "subscriber_id": "sub_forward",
    "dimensions": {
      "vendor": "openai"
    },
    "include": {
      "sum": true,
      "count": true,
      "avg": true,
      "min": true,
      "max": true,
      "last": true
    }
  }
}
```

The callback includes `delivery_id`, `dedupe_key`, `dimensions`, `values.sum`, `values.count`, `values.avg`, `values.min`, `values.max`, and `values.last`.

## Cooldown, Escalation, And Recovery

All alert watches can use `cooldown_seconds`.

During cooldown:

```text
same severity => suppressed
higher severity => allowed as escalation
recovery => allowed if configured and previous state was triggered
```

Severity order:

```text
info
watch
warning
critical
recovery
```

## Action Controls

Operators can control noisy watches:

```text
admin.snoozeWatch  temporarily suppress one watch
admin.muteWatch    suppress a watch or signal until resumed or expiry
admin.resumeWatch  clear active snooze/mute controls
admin.ignoreAlert  mark pending/retrying deliveries for one alert as ignored
```

These actions are tenant-scoped and audited.

## Channel Contracts

Channel contracts define expected signal types, default dimensions, CTA policy, and default watch templates. They help bootstrap a channel consistently.

Example:

```json
{
  "purpose": "Forecast attention monitoring",
  "expected_signal_types": ["forecast_state"],
  "default_dimensions": ["forecast_id", "status"],
  "cta_policy": {
    "required": true,
    "kind": "review"
  },
  "default_watch_templates": [
    {
      "name": "Pace below warning",
      "watch_type": "LAST_VALUE_LT",
      "config": {
        "threshold": 85,
        "severity": "warning",
        "bucket_type": "minute"
      },
      "cooldown_seconds": 3600,
      "recovery": {
        "enabled": true,
        "condition": "value >= 95",
        "severity": "recovery"
      }
    }
  ]
}
```

## What Is Not Supported

These names are not current watch types:

```text
WINDOW_MAX_GT
WINDOW_SUM_LT
WINDOW_COUNT_LT
SPIKE_LT
WINDOW_VS_PREVIOUS_WINDOW_GT
WINDOW_VS_PREVIOUS_WINDOW_LT
```

Use the supported types above or aggregate forwarding depending on the product need.
