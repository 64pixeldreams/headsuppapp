# Schema And Migrations

The core D1 schema lives in:

```text
apps/headsupp-api/migrations/0001_headsupp_core.sql
```

It creates the MVP tables required by the product spec:

```text
workspaces
channels
connectors
subscribers
signals
signal_contracts
watches
watch_states
aggregates
raw_event_dedupe
alerts
alert_deliveries
aggregate_deliveries
```

Important constraints:

```text
signals: channel_id + signal_key unique
aggregates: signal_id + bucket_type + bucket_start_at unique
aggregate_deliveries: subscriber_id + signal_id + bucket_type + bucket_start_at unique
raw_event_dedupe: idempotency_key primary key
```

These constraints are required for idempotency, atomic aggregate upsert, and duplicate-safe aggregate forwarding.
