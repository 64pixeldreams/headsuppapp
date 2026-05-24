# Cursor Spec: Heads Up Core API on Cloudflare

## Product

Build **Heads Up v1 Core API**.

Heads Up is an **attention-processing and aggregation engine**.

It receives high-volume events from webhook/API connectors, aggregates them into meaningful signal buckets, evaluates watches against aggregates, and dispatches alerts or aggregate outputs to subscribers.

It must be able to serve two use cases:

1. **Attention use case**  
“Tell me only when something meaningful changes.”
2. **Aggregation gateway use case**  
“Receive thousands of raw events, aggregate them safely, then forward clean hourly/daily aggregate events to Foretic or another system.”

---

# Non-Negotiable Principles

## 1. Aggregation-first

Do not evaluate watches against raw events.

Raw events are only used to update aggregates.

Rules evaluate aggregates/state.

## 2. Silence by default

Do not notify unless a watch explicitly triggers.

Cooldowns, severity changes, escalation and digest rules must prevent alert spam.

## 3. Ingest must be fast

The ingest endpoint must validate/authenticate, enqueue, and return `202 Accepted`.

No long-running processing in the ingest request.

## 4. Cloudflare-native

Use:

```

```

```
Cloudflare Workers
Cloudflare Queues
Cloudflare D1
Cloudflare Durable Objects
Cloudflare Cron Triggers
```

Do not build dashboards, charts, Slack OAuth, billing, or email connector in v1.

Cloudflare Email Workers can be added later because Cloudflare supports processing incoming emails with Workers, but this v1 should only reserve the connector model for it. 

## 5. Correctness over cleverness

Use atomic upserts for aggregates.

Use Durable Objects where stateful coordination is required.

Avoid read-modify-write race conditions.

---

# Core Architecture

```

```

```
                    ┌────────────────────────────┐
                    │        API Worker           │
                    │ auth / validation / admin   │
                    └────────────┬───────────────┘
                                 │
                                 │ enqueue raw events
                                 ▼
                    ┌────────────────────────────┐
                    │      Cloudflare Queue       │
                    │ raw event buffer / retry    │
                    └────────────┬───────────────┘
                                 │ batched consumer
                                 ▼
                    ┌────────────────────────────┐
                    │   Aggregation Worker        │
                    │ normalize / fold / upsert   │
                    └────────────┬───────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                             ▼
        ┌─────────────────┐          ┌─────────────────────┐
        │ D1 Aggregates    │          │ Watch Evaluator DO   │
        │ source of truth  │          │ serialized per watch │
        └─────────────────┘          └─────────┬───────────┘
                                               │
                                               ▼
                                     ┌─────────────────────┐
                                     │ Alerts / Deliveries │
                                     │ D1 + delivery queue │
                                     └─────────┬───────────┘
                                               │
                                               ▼
                                     ┌─────────────────────┐
                                     │ Webhook Dispatcher  │
                                     │ retry + backoff     │
                                     └─────────────────────┘
```

---

# Why This Architecture

## Workers

Use Workers for stateless request handling: API endpoints, auth, validation, queue writes.

## Queues

Use Queues to buffer ingestion and handle spikes. Queue batching reduces consumer invocations and allows events to be processed in batches. Cloudflare documents `max_batch_size` and `max_batch_timeout` as the controls for consumer batching. 

## D1

Use D1 for metadata and aggregate tables:

```

```

```
workspaces
channels
connectors
signals
watches
aggregates
alerts
subscribers
deliveries
```

Use unique indexes to enforce idempotency and aggregate uniqueness. Cloudflare documents D1 indexes for read performance and uniqueness constraints. 

Use `db.batch()` where multiple D1 statements must commit atomically. Cloudflare documents D1 batched statements as SQL transactions where failure aborts/rolls back the sequence. 

## Durable Objects

Use Durable Objects for **watch evaluation state**, not for every raw event.

Cloudflare’s guidance is that Durable Objects are for stateful coordination, strong consistency, per-entity storage and scheduled work per entity. They are single-threaded per unique object identity, making them suitable for avoiding race conditions in per-watch alert decisions. 

Use one Durable Object per watch:

```

```

```
WatchEvaluatorDO:{watch_id}
```

This prevents duplicate alerts when multiple aggregate updates arrive close together.

---

# v1 Scope

Build:

```

```

```
Workspace model
Channel model
Connector model
Subscriber model
Signal model
Watch model
WatchState model
Aggregate model
Alert model
AlertDelivery model

Webhook ingest connector
Single + batch event ingest
Raw event queue
Aggregation consumer
Atomic aggregate upserts
Watch evaluation via Durable Object
Webhook subscriber delivery
Aggregate-forwarding subscriber
Cooldowns
Escalation
Recovery alerts
Missing expected evaluation
Digest evaluation
```

Do not build:

```

```

```
Email connector
AI extraction
Dashboard
Charts
Slack OAuth
Billing
User-facing frontend
Complex anomaly detection
ML
```

---

# Critical Product Concepts

## Workspace

A tenant/account.

## Channel

A business context.

Examples:

```

```

```
Repairs By Post Revenue
Machine Oxygen Readings
Finance
SEO
Ops
Foretic Forecast Events
```

A channel isolates ingestion, signals, watches and subscribers.

## Connector

An inbound source.

v1 connector:

```

```

```
webhook
```

Future connectors:

```

```

```
email
stripe
foretic
cloudflare
bank_email
```

## Signal

A normalized metric stream inside a channel.

Examples:

```

```

```
oxygen.percent
forecast.revenue.pace
payment.amount
form.submit.count
invoice.paid.amount
```

## Aggregate

A bucketed rollup.

Examples:

```

```

```
1-minute avg oxygen
1-hour avg oxygen
1-day revenue sum
1-week coffee spend
last forecast pace percentage
```

## Watch

A rule that evaluates aggregate state.

Examples:

```

```

```
Alert if 1-hour oxygen average < 15%
Alert if revenue pace < 85%
Escalate if revenue pace < 70%
Send hourly aggregate to Foretic
Alert if no expected payment arrives by month end + grace
```

## Subscriber

An outbound target.

v1 subscribers:

```

```

```
webhook
```

Future subscribers:

```

```

```
slack
email
sms
agent_api
```

A Foretic connector is just a webhook subscriber.

---

# Data Models

Use D1.

Use UUID-style string ids.

Use `created_at`, `updated_at` where relevant.

---

## Table: workspaces

```

```

```
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

---

## Table: channels

```

```

```
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_key TEXT NOT NULL UNIQUE,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace_id
ON channels(workspace_id);
```

---

## Table: connectors

```

```

```
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,

  connector_type TEXT NOT NULL,
  -- webhook | email_future | api_future

  connector_key TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,

  config_json TEXT,

  status TEXT NOT NULL DEFAULT 'active',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE INDEX IF NOT EXISTS idx_connectors_channel_id
ON connectors(channel_id);
```

---

## Table: subscribers

```

```

```
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,

  subscriber_type TEXT NOT NULL,
  -- webhook now; slack/email later

  name TEXT NOT NULL,

  destination_url TEXT NOT NULL,
  secret_hash TEXT,

  mode TEXT NOT NULL DEFAULT 'alert',
  -- alert | aggregate_forward

  config_json TEXT,

  enabled INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_channel_id
ON subscribers(channel_id);
```

---

## Table: signals

```

```

```
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,

  signal_key TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  -- metric | expense | revenue | forecast_state | machine_reading | renewal | event_count

  value_mode TEXT NOT NULL,
  -- sum | count | avg | last | min | max

  unit TEXT,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'active',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_signals_channel_key
ON signals(channel_id, signal_key);

CREATE INDEX IF NOT EXISTS idx_signals_channel_id
ON signals(channel_id);
```

---

## Table: signal_contracts

This lets the API be generic but still meaningful.

```

```

```
CREATE TABLE IF NOT EXISTS signal_contracts (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,

  contract_json TEXT NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (signal_id) REFERENCES signals(id)
);
```

Example contract:

```

```

```
{
  "description": "Forecast revenue pace percentage from Foretic.",
  "value_path": "fields.pace_percent",
  "time_path": "occurred_at",
  "cta_path": "cta",
  "dimensions": ["forecast_id", "status"],
  "default_bucket_types": ["minute", "hour", "day"],
  "default_aggregate": "last"
}
```

---

## Table: watches

```

```

```
CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,

  name TEXT NOT NULL,

  watch_type TEXT NOT NULL,
  -- WINDOW_SUM_GT
  -- WINDOW_COUNT_GT
  -- WINDOW_AVG_LT
  -- WINDOW_AVG_GT
  -- LAST_VALUE_LT
  -- LAST_VALUE_GT
  -- DELTA_LT
  -- DELTA_GT
  -- MISSING_EXPECTED
  -- DIGEST
  -- AGGREGATE_FORWARD

  config_json TEXT NOT NULL,

  cooldown_seconds INTEGER NOT NULL DEFAULT 86400,
  escalation_json TEXT,
  recovery_json TEXT,

  enabled INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (signal_id) REFERENCES signals(id)
);

CREATE INDEX IF NOT EXISTS idx_watches_signal_id
ON watches(signal_id);

CREATE INDEX IF NOT EXISTS idx_watches_channel_id
ON watches(channel_id);

CREATE INDEX IF NOT EXISTS idx_watches_enabled
ON watches(enabled);
```

---

## Table: watch_states

D1 stores canonical state.

The Durable Object serializes updates to this state.

```

```

```
CREATE TABLE IF NOT EXISTS watch_states (
  watch_id TEXT PRIMARY KEY,

  last_evaluated_at TEXT,
  last_alert_at TEXT,
  last_alert_value REAL,
  last_alert_severity TEXT,

  cooldown_until TEXT,

  last_emitted_bucket_start_at TEXT,
  last_digest_at TEXT,
  last_recovery_at TEXT,

  state_json TEXT,

  updated_at TEXT NOT NULL,

  FOREIGN KEY (watch_id) REFERENCES watches(id)
);
```

---

## Table: aggregates

This is the core.

```

```

```
CREATE TABLE IF NOT EXISTS aggregates (
  id TEXT PRIMARY KEY,

  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,

  bucket_type TEXT NOT NULL,
  -- minute | hour | day | week | month

  bucket_start_at TEXT NOT NULL,

  sum_value REAL NOT NULL DEFAULT 0,
  count_value INTEGER NOT NULL DEFAULT 0,
  min_value REAL,
  max_value REAL,
  last_value REAL,
  avg_value REAL,

  first_event_at TEXT,
  last_event_at TEXT,

  updated_at TEXT NOT NULL,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (signal_id) REFERENCES signals(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregates_signal_bucket
ON aggregates(signal_id, bucket_type, bucket_start_at);

CREATE INDEX IF NOT EXISTS idx_aggregates_signal_bucket_time
ON aggregates(signal_id, bucket_type, bucket_start_at);
```

Important:

Do **not** read aggregate, add in JavaScript, then write.

Use atomic SQL upsert.

---

## Table: raw_event_dedupe

Use this for idempotency.

```

```

```
CREATE TABLE IF NOT EXISTS raw_event_dedupe (
  idempotency_key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_key TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_event_dedupe_received_at
ON raw_event_dedupe(received_at);
```

Retention:

```

```

```
Keep 24–72 hours for MVP.
Delete old rows via scheduled cleanup.
```

---

## Table: alerts

```

```

```
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,

  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  watch_id TEXT NOT NULL,

  triggered_at TEXT NOT NULL,

  severity TEXT NOT NULL,
  -- info | watch | warning | critical | recovery

  current_value REAL,
  threshold_value REAL,

  summary_text TEXT NOT NULL,
  payload_json TEXT NOT NULL,

  cta_label TEXT,
  cta_url TEXT,

  created_at TEXT NOT NULL,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (signal_id) REFERENCES signals(id),
  FOREIGN KEY (watch_id) REFERENCES watches(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_watch_id
ON alerts(watch_id);

CREATE INDEX IF NOT EXISTS idx_alerts_channel_id
ON alerts(channel_id);
```

---

## Table: alert_deliveries

```

```

```
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id TEXT PRIMARY KEY,

  alert_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,

  destination_url TEXT NOT NULL,

  status TEXT NOT NULL,
  -- pending | sent | failed | retrying

  attempt_count INTEGER NOT NULL DEFAULT 0,

  last_attempt_at TEXT,
  next_retry_at TEXT,

  response_code INTEGER,
  response_body TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (alert_id) REFERENCES alerts(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_status_next
ON alert_deliveries(status, next_retry_at);
```

---

## Table: aggregate_deliveries

Used when Heads Up forwards aggregates to Foretic.

```

```

```
CREATE TABLE IF NOT EXISTS aggregate_deliveries (
  id TEXT PRIMARY KEY,

  subscriber_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,

  bucket_type TEXT NOT NULL,
  bucket_start_at TEXT NOT NULL,

  status TEXT NOT NULL,
  -- pending | sent | failed | retrying

  attempt_count INTEGER NOT NULL DEFAULT 0,

  payload_json TEXT NOT NULL,

  last_attempt_at TEXT,
  next_retry_at TEXT,

  response_code INTEGER,
  response_body TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (signal_id) REFERENCES signals(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregate_delivery_once
ON aggregate_deliveries(subscriber_id, signal_id, bucket_type, bucket_start_at);
```

This prevents sending the same hourly aggregate twice.

---

# Event Payload

Endpoint:

```

```

```
POST /v1/events/{connector_key}
```

Accept single event or batch.

Single:

```

```

```
{
  "idempotency_key": "evt_123",
  "signal_key": "oxygen.percent",
  "occurred_at": "2026-05-23T14:00:00Z",
  "value": {
    "num": 16.4
  },
  "fields": {
    "machine_id": "machine_a",
    "sensor_id": "oxygen_1"
  },
  "cta": {
    "label": "View machine",
    "url": "https://example.com/machines/a",
    "kind": "view"
  }
}
```

Batch:

```

```

```
{
  "events": [
    {
      "idempotency_key": "evt_001",
      "signal_key": "oxygen.percent",
      "occurred_at": "2026-05-23T14:00:00Z",
      "value": { "num": 10 }
    },
    {
      "idempotency_key": "evt_002",
      "signal_key": "oxygen.percent",
      "occurred_at": "2026-05-23T14:00:01Z",
      "value": { "num": 20 }
    }
  ]
}
```

Foretic state event:

```

```

```
{
  "idempotency_key": "foretic_fc123_2026_05_23_1400",
  "signal_key": "forecast.revenue.pace",
  "occurred_at": "2026-05-23T14:00:00Z",
  "value": {
    "num": 64
  },
  "fields": {
    "forecast_id": "fc_123",
    "forecast_name": "Repairs By Post May Revenue",
    "pace_percent": 64,
    "status": "critical",
    "actual_to_date": 11200,
    "expected_to_date": 17500,
    "target": 30000,
    "primary_driver": "average_estimate_value"
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123",
    "kind": "review"
  }
}
```

---

# Authentication

Use HMAC for webhook connectors.

Headers:

```

```

```
X-HeadsUp-Timestamp: 2026-05-23T14:00:00Z
X-HeadsUp-Signature: sha256=<signature>
```

Signature payload:

```

```

```
timestamp + "." + raw_body
```

Reject if:

```

```

```
timestamp older than 5 minutes
signature invalid
connector disabled
payload too large
```

Use constant-time comparison.

---

# Queue Design

## Queue 1: RAW_EVENTS_QUEUE

Used by ingest endpoint.

Messages should contain:

```

```

```
type RawQueueMessage = {
  workspaceId: string;
  channelId: string;
  connectorId: string;
  receivedAt: string;
  event: HeadsUpIncomingEvent;
};
```

Ingest Worker:

```

```

```
validate schema
authenticate connector
normalize single/batch into array
split into chunks of max 100
sendBatch to RAW_EVENTS_QUEUE
return 202
```

Cloudflare Queues currently document max `sendBatch` messages as 100, with total batch size limit 256KB, so split larger batches. 

---

## Queue 2: ALERT_DELIVERY_QUEUE

Used for outbound alert deliveries.

Message:

```

```

```
type AlertDeliveryQueueMessage = {
  deliveryId: string;
};
```

---

## Queue 3: AGGREGATE_DELIVERY_QUEUE

Used for forwarding aggregates to Foretic or other webhook subscribers.

Message:

```

```

```
type AggregateDeliveryQueueMessage = {
  aggregateDeliveryId: string;
};
```

---

# Aggregation Consumer

The queue consumer receives batches.

Algorithm:

```

```

```
1. Receive batch of raw events.
2. Validate event shape again defensively.
3. Resolve or create signal.
4. Apply idempotency.
5. Convert events into aggregate deltas.
6. Group/fold by:
   workspace_id
   channel_id
   signal_id
   bucket_type
   bucket_start_at
7. Atomic upsert folded aggregate deltas into D1.
8. For affected signal/watch pairs, invoke WatchEvaluatorDO.
```

---

# Bucket Types

For v1, support:

```

```

```
minute
hour
day
month
```

Optionally add `week` later.

Each event should update multiple bucket types configured by the signal contract.

Example oxygen readings:

```

```

```
minute
hour
day
```

Example Foretic forecast pace:

```

```

```
minute
hour
day
```

Example spend:

```

```

```
day
week future
month
```

---

# Atomic Aggregate Upsert

Use a single SQL upsert per aggregate delta.

Example:

```

```

```
INSERT INTO aggregates (
  id,
  workspace_id,
  channel_id,
  signal_id,
  bucket_type,
  bucket_start_at,
  sum_value,
  count_value,
  min_value,
  max_value,
  last_value,
  avg_value,
  first_event_at,
  last_event_at,
  updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(signal_id, bucket_type, bucket_start_at)
DO UPDATE SET
  sum_value = aggregates.sum_value + excluded.sum_value,
  count_value = aggregates.count_value + excluded.count_value,
  min_value = CASE
    WHEN aggregates.min_value IS NULL THEN excluded.min_value
    WHEN excluded.min_value IS NULL THEN aggregates.min_value
    ELSE MIN(aggregates.min_value, excluded.min_value)
  END,
  max_value = CASE
    WHEN aggregates.max_value IS NULL THEN excluded.max_value
    WHEN excluded.max_value IS NULL THEN aggregates.max_value
    ELSE MAX(aggregates.max_value, excluded.max_value)
  END,
  last_value = excluded.last_value,
  avg_value = (aggregates.sum_value + excluded.sum_value) / (aggregates.count_value + excluded.count_value),
  last_event_at = CASE
    WHEN excluded.last_event_at > aggregates.last_event_at THEN excluded.last_event_at
    ELSE aggregates.last_event_at
  END,
  updated_at = excluded.updated_at;
```

Important:

```

```

```
Do not use SELECT then UPDATE for aggregate increments.
Do not do arithmetic in JavaScript against existing aggregate state.
Use SQL atomic increments.
```

---

# Idempotency Handling

Before writing aggregate deltas, insert idempotency keys.

For each event:

```

```

```
INSERT OR IGNORE INTO raw_event_dedupe (
  idempotency_key,
  workspace_id,
  channel_id,
  signal_key,
  received_at
)
VALUES (?, ?, ?, ?, ?);
```

Only process event if insert succeeded.

If duplicate:

```

```

```
acknowledge message
do not update aggregate
do not evaluate watches
```

For events without idempotency key:

```

```

```
Generate one from connector_id + signal_key + occurred_at + hash(payload)
```

But prefer client-supplied keys.

---

# Signal Creation

Signals can be created lazily.

If event contains unknown `signal_key`:

```

```

```
create signal using defaults
signal_type = "metric"
value_mode = "avg" or "last" depending payload/config
status = active
create default signal_contract
```

For Foretic integration, create signals explicitly when setting up the watch. Do not rely on lazy creation for Foretic.

---

# Watch Evaluation

## WatchEvaluator Durable Object

Class:

```

```

```
export class WatchEvaluatorDO extends DurableObject<Env> {
  async evaluate(input: EvaluateWatchInput): Promise<EvaluateWatchResult>
}
```

Keyed by:

```

```

```
watch_id
```

Use deterministic DO id:

```

```

```
env.WATCH_EVALUATOR.idFromName(watchId)
```

Why:

```

```

```
Only one instance evaluates a given watch at a time.
Prevents duplicate alerts.
Serializes state transitions.
```

Cloudflare Durable Objects are suitable for this because each object has a unique identity and handles coordinated state consistently; Cloudflare explicitly recommends Durable Objects where coordination and strong consistency are required. 

---

## Evaluation Input

```

```

```
type EvaluateWatchInput = {
  watchId: string;
  reason:
    | "aggregate_updated"
    | "scheduled_missing_expected"
    | "scheduled_digest"
    | "manual_test";

  signalId?: string;
  bucketType?: string;
  bucketStartAt?: string;
  now: string;
};
```

---

## Evaluation Flow

Inside DO:

```

```

```
1. Load watch.
2. Load watch_state.
3. If disabled, return.
4. If cooldown active, return unless escalation/recovery applies.
5. Query relevant aggregates.
6. Calculate current value.
7. Determine severity.
8. Compare against previous state.
9. Decide:
   - no alert
   - alert
   - escalation alert
   - recovery alert
   - digest alert
   - aggregate forward
10. Persist alert + updated watch_state using D1 batch.
11. Create alert_delivery or aggregate_delivery rows.
12. Enqueue delivery messages.
```

Use D1 `batch()` for alert + state + delivery creation where these must commit together. Cloudflare documents D1 `batch()` as transactional for batched statements. 

---

# Watch Types

## LAST_VALUE_LT

Use for Foretic pace:

```

```

```
{
  "field": "last_value",
  "threshold": 85,
  "bucket_type": "minute",
  "severity": "warning"
}
```

## LAST_VALUE_GT

Use for spend/current metric limits.

## WINDOW_AVG_LT

Use for machine/sensor readings:

```

```

```
{
  "bucket_type": "minute",
  "window": {
    "size": 60,
    "unit": "minute"
  },
  "threshold": 15
}
```

Meaning:

```

```

```
Alert if average across last 60 minute buckets is below 15.
```

## WINDOW_SUM_GT

Use for spend:

```

```

```
{
  "bucket_type": "day",
  "window": {
    "size": 7,
    "unit": "day"
  },
  "threshold": 300
}
```

## WINDOW_COUNT_GT

Use for uploads/errors/API calls.

## DELTA_LT / DELTA_GT

Use for change between current and previous windows.

## MISSING_EXPECTED

Evaluated by scheduled job only.

Example:

```

```

```
{
  "expected_every": {
    "unit": "day",
    "count": 1
  },
  "grace_seconds": 3600,
  "minimum_count": 1
}
```

## DIGEST

Scheduled summary.

Example:

```

```

```
{
  "schedule": "daily",
  "time": "09:00",
  "include": ["status", "last_value", "open_alerts"]
}
```

## AGGREGATE_FORWARD

This is the big new use case.

Example:

```

```

```
{
  "bucket_type": "hour",
  "aggregate": "avg",
  "emit_after_grace_seconds": 60,
  "subscriber_id": "sub_foretic",
  "include": {
    "sum": true,
    "count": true,
    "avg": true,
    "min": true,
    "max": true,
    "last": true
  }
}
```

Meaning:

```

```

```
When an hourly bucket closes, send one aggregate payload to Foretic.
```

---

# Aggregate Forwarding to Foretic

This is the “high volume compression” use case.

## Scenario

Raw events:

```

```

```
10%, 20%, 12%, 15%, 16%, 21%, 4%
```

Heads Up aggregates by hour:

```

```

```
{
  "signal_key": "oxygen.percent",
  "bucket_type": "hour",
  "bucket_start_at": "2026-05-23T14:00:00Z",
  "avg_value": 14,
  "min_value": 4,
  "max_value": 21,
  "count_value": 7
}
```

Then sends one payload to Foretic:

```

```

```
{
  "source": "heads_up",
  "event_type": "aggregate_bucket_closed",
  "signal_key": "oxygen.percent",
  "bucket": {
    "type": "hour",
    "start_at": "2026-05-23T14:00:00Z",
    "end_at": "2026-05-23T15:00:00Z"
  },
  "values": {
    "sum": 98,
    "count": 7,
    "avg": 14,
    "min": 4,
    "max": 21,
    "last": 4
  },
  "cta": {
    "label": "View channel",
    "url": "https://headsupp.io/channels/channel_123"
  }
}
```

Foretic receives one event per hour, not thousands per minute.

That is extremely useful.

---

# Scheduled Jobs

Use Cloudflare Cron Triggers.

Required scheduled tasks:

```

```

```
Every minute:
- evaluate MISSING_EXPECTED watches due now
- evaluate AGGREGATE_FORWARD watches for closed buckets
- process retryable alert deliveries
- process retryable aggregate deliveries

Every hour:
- cleanup raw_event_dedupe older than retention
- optional digest watches

Daily:
- cleanup old raw debug data if added later
```

MISSING_EXPECTED must not depend on ingest timing. It must be scheduled.

---

# Delivery

## Alert Delivery Payload

Webhook subscriber receives:

```

```

```
{
  "type": "heads_up.alert",
  "alert_id": "alert_123",
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "signal_key": "forecast.revenue.pace",
  "watch_id": "watch_123",
  "severity": "critical",
  "summary": "Repairs By Post revenue pace is critical at 64%.",
  "current_value": 64,
  "threshold_value": 70,
  "triggered_at": "2026-05-23T14:00:00Z",
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123"
  },
  "data": {
    "forecast_id": "fc_123",
    "forecast_name": "Repairs By Post May Revenue",
    "actual_to_date": 11200,
    "expected_to_date": 17500,
    "primary_driver": "average_estimate_value"
  }
}
```

## Aggregate Forward Payload

```

```

```
{
  "type": "heads_up.aggregate",
  "workspace_id": "ws_123",
  "channel_id": "ch_123",
  "signal_key": "oxygen.percent",
  "bucket_type": "hour",
  "bucket_start_at": "2026-05-23T14:00:00Z",
  "bucket_end_at": "2026-05-23T15:00:00Z",
  "values": {
    "sum": 9800,
    "count": 700,
    "avg": 14,
    "min": 4,
    "max": 21,
    "last": 16
  }
}
```

---

# Delivery Retry

Dispatcher:

```

```

```
fetch destination_url
timeout after 10 seconds
mark sent on 2xx
retry on 429/5xx/network errors
fail permanently on 400/401/403/404 unless configured otherwise
```

Backoff:

```

```

```
attempt 1: immediate
attempt 2: +1 minute
attempt 3: +5 minutes
attempt 4: +15 minutes
attempt 5: +1 hour
attempt 6: +6 hours
then failed
```

---

# Cooldowns, Escalation, Recovery

## Basic cooldown

If alert fired recently:

```

```

```
do not repeat until cooldown_until
```

## Escalation

Allow alert during cooldown only if severity increases.

Example:

```

```

```
{
  "levels": [
    { "severity": "warning", "condition": "value < 85" },
    { "severity": "critical", "condition": "value < 70" }
  ],
  "notify_on_severity_change": true
}
```

Flow:

```

```

```
10:00 pace 84 → warning alert
10:10 pace 82 → silent
10:30 pace 69 → critical alert
10:35 pace 68 → silent
```

## Recovery

Optional recovery alert.

```

```

```
{
  "enabled": true,
  "condition": "value >= 95",
  "severity": "recovery"
}
```

Flow:

```

```

```
10:00 critical
11:00 still critical → silent
Next day recovered to 97 → recovery alert
```

---

# Foretic Integration

## Foretic should stop owning notification logic

Foretic should not decide Slack/email/webhook spam rules.

Foretic should:

```

```

```
calculate forecast state
calculate driver state
emit structured event to Heads Up
provide CTA back to Foretic
```

Heads Up should:

```

```

```
aggregate
evaluate
cooldown
escalate
recover
notify
forward aggregates
```

---

## Foretic “Subscribe” should become “Watch this forecast”

When user clicks:

```

```

```
Watch this forecast
```

Foretic creates:

```

```

```
Heads Up channel
Heads Up webhook connector
Heads Up signal contracts
Heads Up watches
Heads Up subscribers
```

Example watches:

```

```

```
Warn if pace < 85%
Critical if pace < 70%
Recovery if pace > 95%
Digest daily at 09:00 while warning/critical
Forward selected aggregates back to Foretic hourly
```

---

## Foretic Event Emission

Foretic emits:

```

```

```
forecast_state
forecast_driver_state
intervention_due
forecast_recovered
dataset_missing
```

Example:

```

```

```
{
  "idempotency_key": "fc_123_state_2026_05_23_1400",
  "signal_key": "forecast.revenue.pace",
  "occurred_at": "2026-05-23T14:00:00Z",
  "value": { "num": 64 },
  "fields": {
    "forecast_id": "fc_123",
    "pace_percent": 64,
    "status": "critical",
    "actual_to_date": 11200,
    "expected_to_date": 17500,
    "target": 30000
  },
  "cta": {
    "label": "View forecast",
    "url": "https://foretic.io/forecasts/fc_123",
    "kind": "review"
  }
}
```

---

# API Endpoints

## Admin

```

```

```
POST /v1/workspaces
GET /v1/workspaces/{workspace_id}
```

```

```

```
POST /v1/channels
GET /v1/channels/{channel_id}
PATCH /v1/channels/{channel_id}
```

```

```

```
POST /v1/channels/{channel_id}/connectors
GET /v1/channels/{channel_id}/connectors
```

```

```

```
POST /v1/channels/{channel_id}/subscribers
GET /v1/channels/{channel_id}/subscribers
PATCH /v1/subscribers/{subscriber_id}
```

```

```

```
POST /v1/channels/{channel_id}/signals
GET /v1/channels/{channel_id}/signals
```

```

```

```
POST /v1/signals/{signal_id}/watches
GET /v1/signals/{signal_id}/watches
PATCH /v1/watches/{watch_id}
```

---

## Ingest

```

```

```
POST /v1/events/{connector_key}
```

Returns:

```

```

```
{
  "accepted": true,
  "queued": 100,
  "rejected": 0
}
```

Status:

```

```

```
202 Accepted
```

---

## Testing

```

```

```
POST /v1/watches/{watch_id}/test
```

Manually invokes WatchEvaluatorDO.

```

```

```
POST /v1/connectors/{connector_id}/test-event
```

Sends a sample event through the pipeline.

---

# Worker Structure

Suggested files:

```

```

```
/src/index.ts
/src/routes/admin.ts
/src/routes/ingest.ts

/src/queues/rawEventsConsumer.ts
/src/queues/alertDeliveryConsumer.ts
/src/queues/aggregateDeliveryConsumer.ts

/src/durable/WatchEvaluatorDO.ts

/src/services/auth/hmac.ts
/src/services/events/validateEvent.ts
/src/services/events/normalizeEvent.ts
/src/services/signals/resolveSignal.ts
/src/services/aggregation/buckets.ts
/src/services/aggregation/foldBatch.ts
/src/services/aggregation/upsertAggregates.ts
/src/services/watches/evaluateWatch.ts
/src/services/watches/queryAggregateWindow.ts
/src/services/alerts/createAlert.ts
/src/services/delivery/dispatchWebhook.ts
/src/services/delivery/backoff.ts

/src/sql/schema.sql
/src/types.ts
```

---

# wrangler.toml Shape

Use actual names from your project.

```

```

```
name = "heads-up-api"
main = "src/index.ts"
compatibility_date = "2026-05-23"

[[d1_databases]]
binding = "DB"
database_name = "heads_up"
database_id = "..."

[[queues.producers]]
binding = "RAW_EVENTS_QUEUE"
queue = "heads-up-raw-events"

[[queues.consumers]]
queue = "heads-up-raw-events"
max_batch_size = 100
max_batch_timeout = 5

[[queues.producers]]
binding = "ALERT_DELIVERY_QUEUE"
queue = "heads-up-alert-delivery"

[[queues.consumers]]
queue = "heads-up-alert-delivery"
max_batch_size = 25
max_batch_timeout = 5

[[queues.producers]]
binding = "AGGREGATE_DELIVERY_QUEUE"
queue = "heads-up-aggregate-delivery"

[[queues.consumers]]
queue = "heads-up-aggregate-delivery"
max_batch_size = 25
max_batch_timeout = 5

[[durable_objects.bindings]]
name = "WATCH_EVALUATOR"
class_name = "WatchEvaluatorDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["WatchEvaluatorDO"]

[triggers]
crons = ["* * * * *"]
```

Use SQLite-backed Durable Objects for new DO namespaces. Cloudflare currently documents SQLite-backed Durable Objects as the recommended backend for new Durable Object namespaces, with SQL, KV and alarms available on that storage backend. 

---

# Implementation Order

## Step 1: D1 schema

Create all tables.

Create unique indexes first.

Do not write application logic until uniqueness constraints exist.

## Step 2: Admin API

Implement:

```

```

```
workspace creation
channel creation
webhook connector creation
subscriber creation
signal creation
watch creation
```

No UI.

Test with curl/Postman.

## Step 3: Ingest endpoint

Implement:

```

```

```
POST /v1/events/{connector_key}
HMAC verification
single/batch support
schema validation
queue sendBatch
202 response
```

No aggregation in request path.

## Step 4: Queue consumer

Implement raw event consumer:

```

```

```
dedupe
resolve signal
bucket events
fold deltas
atomic aggregate upsert
invoke WatchEvaluatorDO for affected watches
```

## Step 5: WatchEvaluatorDO

Implement:

```

```

```
load watch
load state
query aggregate window
evaluate watch type
respect cooldown
handle escalation
handle recovery
create alert/delivery
update state
```

## Step 6: Webhook delivery

Implement alert delivery queue.

## Step 7: Aggregate forwarding

Implement `AGGREGATE_FORWARD` watch.

This is the Foretic compression feature.

## Step 8: Cron

Implement:

```

```

```
missing expected evaluation
digest watches
aggregate forward for closed buckets
delivery retries
dedupe cleanup
```

## Step 9: Foretic integration

In Foretic:

```

```

```
replace/extend Subscribe with Watch this forecast
create Heads Up channel/connector/signal/watch/subscriber
emit forecast_state events
receive Heads Up alerts/aggregate forwards
```

---

# Test Scenarios

## Test 1: High-volume ingest

Send 10,000 events to one connector.

Expected:

```

```

```
ingest returns 202
queue processes batch
aggregates update correctly
no alert spam
```

## Test 2: Oxygen hourly aggregate

Send values:

```

```

```
10, 20, 12, 15, 16, 21, 4
```

Expected aggregate:

```

```

```
sum = 98
count = 7
avg = 14
min = 4
max = 21
last = 4
```

## Test 3: Foretic pace warning

Send pace:

```

```

```
90 → 84 → 83 → 82
```

Watch:

```

```

```
warning below 85
cooldown 24h
```

Expected:

```

```

```
one warning alert at 84
no repeat at 83/82
```

## Test 4: Escalation

Send pace:

```

```

```
84 → 69
```

Expected:

```

```

```
warning at 84
critical escalation at 69
```

## Test 5: Recovery

Send:

```

```

```
69 → 96
```

Expected:

```

```

```
critical alert
recovery alert when >= 95
```

## Test 6: Aggregate forward to Foretic

Configure hourly aggregate forward.

Send thousands of raw sensor events.

Expected:

```

```

```
one aggregate payload sent to Foretic after bucket closes
no duplicate aggregate delivery
```

## Test 7: Missing expected

Configure:

```

```

```
expect at least one payment event per day by 10:00 + 1h grace
```

Do not send event.

Expected:

```

```

```
one missing expected alert
no spam afterward
```

---

# Important Engineering Rules

## Do not do this

```

```

```
Do not evaluate watches inside ingest.
Do not send Slack/webhook directly from ingest.
Do not update aggregates using read-modify-write in JS.
Do not create alerts without checking WatchState.
Do not process raw high-volume events directly in Foretic.
Do not build email connector yet.
Do not build dashboard yet.
```

## Do this

```

```

```
Ingest fast.
Queue everything.
Fold batches.
Atomic upsert aggregates.
Evaluate watches via Durable Object.
Persist alerts before delivery.
Retry delivery separately.
Forward aggregates to Foretic as clean events.
```

---

# MVP Summary

The MVP must prove this:

```

```

```
Heads Up can ingest high-volume raw events,
aggregate them safely,
evaluate meaningful watches,
avoid alert spam,
and forward either alerts or aggregate summaries to subscribers.
```

For Foretic, this means:

```

```

```
Foretic no longer needs to ingest every raw event.
Foretic can receive clean hourly/daily aggregates.
Foretic can emit forecast state into Heads Up.
Heads Up decides when humans or systems need to know.
```

That is the correct architecture.

And yes — this is clever. It turns Heads Up into a reusable Cloudflare-native signal runtime for your entire IP studio.