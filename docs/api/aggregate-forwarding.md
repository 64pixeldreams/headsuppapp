# Aggregate Forwarding

Primary docs: use [quickstart.md](quickstart.md) for setup flow and [reference.md](reference.md) for canonical action props. This file documents the aggregate-forward behavior, supported bucket sizes, callback payload, delivery semantics, and examples.

`AGGREGATE_FORWARD` turns Heads Up into an aggregation gateway. Instead of forwarding every raw event, Heads Up folds events into time buckets and sends one webhook when a bucket is closed.

Use it when another system wants clean summaries for analytics, billing, reporting, dashboards, enrichment jobs, or product workflows that should not receive the raw event firehose.

## When To Use It

Use alert watches when Heads Up should decide whether something needs attention:

```text
WINDOW_SUM_GT
LAST_VALUE_GT
TREND_UP_GT
MISSING_EXPECTED
```

Use aggregate forwarding when your downstream system should receive the aggregate itself:

```text
AGGREGATE_FORWARD
```

Common examples:

```text
Website analytics
  Forward daily form-view counts to a reporting system.

Usage billing
  Forward monthly usage totals to a billing pipeline.

Market feeds
  Forward hourly min/max/last price buckets to a pricing service.

Spend analytics
  Forward weekly coffee-spend totals and max purchase values.
```

## Supported Bucket Types

Heads Up currently supports these aggregate bucket types:

```text
minute
hour
day
week
month
```

Bucket boundaries are UTC:

```text
minute
  Starts at the UTC minute, seconds and milliseconds set to 0.

hour
  Starts at the UTC hour, minutes/seconds/milliseconds set to 0.

day
  Starts at 00:00:00.000 UTC for the UTC calendar day.

week
  Starts at 00:00:00.000 UTC on Monday.

month
  Starts at 00:00:00.000 UTC on the first day of the UTC calendar month.
```

`quarter` and `year` are not supported bucket types today. If you need quarterly or yearly reporting now, forward monthly buckets and roll them up downstream.

## Aggregate Values

Each aggregate bucket stores numeric summaries from event `value.num`:

```text
sum
  Sum of all numeric values in the bucket.

count
  Number of events folded into the bucket.

avg
  sum / count.

min
  Lowest value in the bucket.

max
  Highest value in the bucket.

last
  Most recent value seen for the bucket.
```

Heads Up also stores bucket timing and dimensions:

```text
bucket.type
bucket.start_at
bucket.end_at
dimensions
dimensions_hash
signal_key
workspace_id
channel_id
```

## How Buckets Are Created

Buckets are materialized from the signal contract. The default contract creates:

```json
{
  "default_bucket_types": ["minute", "hour", "day"],
  "dimensions": []
}
```

To forward weekly or monthly buckets, configure the signal or channel contract to materialize those bucket types:

```json
{
  "action": "admin.createSignal",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "signal_key": "website.form.views",
    "signal_type": "metric",
    "value_mode": "last",
    "contract": {
      "default_bucket_types": ["hour", "day", "week", "month"],
      "dimensions": ["source", "form_id"]
    }
  }
}
```

Dimensions are copied from `event.fields` using the configured dimension paths. Each unique dimension set gets its own aggregate bucket.

## Ingest Event Example

```http
POST /v1/events/{connector_key}
Content-Type: application/json
X-HeadsUp-Signature: ...
```

```json
{
  "idempotency_key": "evt_form_001",
  "occurred_at": "2026-05-26T10:42:18.000Z",
  "signal_key": "website.form.views",
  "value": {
    "num": 1
  },
  "fields": {
    "source": "paid_search",
    "form_id": "quote_form"
  },
  "cta": {
    "label": "View analytics",
    "url": "https://example.com/analytics/forms/quote_form"
  }
}
```

If the signal contract includes `hour`, `day`, and `week`, this one event contributes to three buckets:

```text
hour  2026-05-26T10:00:00.000Z
day   2026-05-26T00:00:00.000Z
week  2026-05-25T00:00:00.000Z
```

## Create An Aggregate Forward Subscriber

Create one subscriber for the downstream webhook endpoint:

```json
{
  "action": "admin.createSubscriber",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "subscriber_type": "webhook",
    "name": "Reporting aggregate webhook",
    "destination_url": "https://example.com/webhooks/headsupp/aggregates",
    "mode": "aggregate_forward",
    "config": {
      "signing_secret": "whsec_replace_me"
    }
  }
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "subscriber": {
      "id": "sub_report_aggregates",
      "subscriber_id": "sub_report_aggregates",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "subscriber_type": "webhook",
      "name": "Reporting aggregate webhook",
      "destination_url_redacted": "https://example.com/webhooks/headsupp/aggregates/...",
      "mode": "aggregate_forward",
      "enabled": 1,
      "config": {
        "signing_secret": "whsec_replace_me"
      }
    }
  }
}
```

## Create An Aggregate Forward Watch

Create an `AGGREGATE_FORWARD` watch for the signal and bucket type you want to emit.

Hourly example:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_demo",
    "signal_id": "sig_form_views",
    "name": "Forward hourly form views",
    "watch_type": "AGGREGATE_FORWARD",
    "config": {
      "bucket_type": "hour",
      "emit_after_grace_seconds": 60,
      "subscriber_id": "sub_report_aggregates",
      "dimensions": {
        "source": "paid_search",
        "form_id": "quote_form"
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
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "watch": {
      "id": "watch_forward_hourly_form_views",
      "watch_id": "watch_forward_hourly_form_views",
      "workspace_id": "ws_demo",
      "channel_id": "ch_demo",
      "signal_id": "sig_form_views",
      "name": "Forward hourly form views",
      "watch_type": "AGGREGATE_FORWARD",
      "config": {
        "bucket_type": "hour",
        "emit_after_grace_seconds": 60,
        "subscriber_id": "sub_report_aggregates",
        "dimensions": {
          "source": "paid_search",
          "form_id": "quote_form"
        },
        "include": {
          "sum": true,
          "count": true,
          "avg": true,
          "min": true,
          "max": true,
          "last": true
        }
      },
      "enabled": 1
    }
  }
}
```

## Config Fields

`AGGREGATE_FORWARD` watch config supports:

```text
bucket_type
  Required in practice. Defaults to hour if omitted.
  Must be one of minute, hour, day, week, month.

subscriber_id
  Required. The aggregate-forward subscriber that receives callbacks.

emit_after_grace_seconds
  Optional. Defaults to 60.
  Heads Up waits this long before considering a bucket closed.

dimensions
  Optional object. If present, only forwards the aggregate bucket for that exact dimension set.
  If omitted, forwards all dimension buckets for the signal/bucket type.

include
  Optional object. Controls which values are included.
  Any value explicitly set to false is omitted.
```

Include example:

```json
{
  "include": {
    "sum": true,
    "count": true,
    "avg": false,
    "min": false,
    "max": true,
    "last": true
  }
}
```

## Callback Payload

Heads Up sends a `POST` request to the subscriber `destination_url`.

```http
POST /webhooks/headsupp/aggregates
Content-Type: application/json
X-HeadsUp-Timestamp: 1779807660
X-HeadsUp-Signature: v1=...
X-HeadsUp-Delivery-Id: aggdel_abc123
```

Headers are signed when the subscriber has `config.signing_secret` or the Worker has `OUTBOUND_WEBHOOK_SIGNING_SECRET`. The signature message is:

```text
{timestamp}.{raw_request_body}
```

Payload:

```json
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "signal_key": "website.form.views",
  "workspace_id": "ws_demo",
  "channel_id": "ch_demo",
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-26T10:00:00.000Z",
    "end_at": "2026-05-26T11:00:00.000Z"
  },
  "dimensions_hash": "d8f0b2c1",
  "dimensions": {
    "source": "paid_search",
    "form_id": "quote_form"
  },
  "channel_metadata": {
    "product": "website_analytics"
  },
  "values": {
    "sum": 428,
    "count": 428,
    "avg": 1,
    "min": 1,
    "max": 1,
    "last": 1
  },
  "fields": {
    "source": "paid_search",
    "form_id": "quote_form"
  },
  "cta": {
    "label": "View analytics",
    "url": "https://example.com/analytics/forms/quote_form"
  },
  "delivery_id": "aggdel_abc123",
  "dedupe_key": "sub_report_aggregates:sig_form_views:hour:2026-05-26T10:00:00.000Z:d8f0b2c1"
}
```

## Callback Response Handling

Your endpoint should return any `2xx` status after it has accepted the payload.

Delivery behavior:

```text
2xx
  Marked sent.

400, 401, 403, 404
  Marked failed without retry.

Other non-2xx or network error
  Retried with backoff until retry budget is exhausted.
```

Aggregate deliveries are idempotent. Heads Up creates one delivery row for:

```text
subscriber_id + signal_id + bucket_type + bucket_start_at + dimensions_hash
```

Consumers should also treat `dedupe_key` as idempotency input.

## Weekly And Monthly Examples

Weekly max purchase:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_coffee",
    "signal_id": "sig_coffee_purchase",
    "name": "Forward weekly coffee spend",
    "watch_type": "AGGREGATE_FORWARD",
    "config": {
      "bucket_type": "week",
      "emit_after_grace_seconds": 300,
      "subscriber_id": "sub_report_aggregates",
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
}
```

Monthly usage total:

```json
{
  "action": "admin.createWatch",
  "payload": {
    "workspace_id": "ws_demo",
    "channel_id": "ch_usage",
    "signal_id": "sig_api_tokens_used",
    "name": "Forward monthly API token usage",
    "watch_type": "AGGREGATE_FORWARD",
    "config": {
      "bucket_type": "month",
      "emit_after_grace_seconds": 900,
      "subscriber_id": "sub_billing_pipeline",
      "include": {
        "sum": true,
        "count": true,
        "avg": false,
        "min": false,
        "max": false,
        "last": false
      }
    }
  }
}
```

## Proof

Use the deployed scheduled proof:

```bash
cd apps/headsupp-api
npm run smoke:scheduled
```

Expected proof includes:

```text
AGGREGATE_FORWARD creates one closed-bucket delivery
aggregate-forward payload includes delivery_id
aggregate-forward payload includes dedupe_key
second cron pass does not duplicate the same closed-bucket delivery
```

Use the dimension-filtered proof:

```bash
cd apps/headsupp-api
npm run smoke:aggregate-forward-dimensions
```

## Important Notes

`AGGREGATE_FORWARD` only forwards buckets that exist. If a signal contract does not materialize `week`, a weekly aggregate-forward watch has nothing to send.

The current month and current week are not forwarded until they close. Use shorter buckets if the downstream system needs near-real-time updates.

Use one subscriber per destination. Use one watch per signal/bucket/dimension forwarding rule.
