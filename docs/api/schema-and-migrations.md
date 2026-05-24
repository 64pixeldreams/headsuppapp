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
control_plane_audit_logs
operational_status
```

Important constraints:

```text
signals: channel_id + signal_key unique
aggregates: signal_id + bucket_type + bucket_start_at unique
aggregate_deliveries: subscriber_id + signal_id + bucket_type + bucket_start_at unique
raw_event_dedupe: idempotency_key primary key
control_plane_audit_logs: request/action/actor/target metadata only, no secrets
operational_status: one row per operator health signal
```

These constraints are required for idempotency, atomic aggregate upsert, and duplicate-safe aggregate forwarding.

`control_plane_audit_logs` records low-volume admin/operator actions. It must not contain raw API keys, connector secrets, Slack webhook URLs, generic webhook destination URLs, or raw event payloads.

`operational_status` records small status rows such as `scheduled_tasks`. It is used by observability to report whether cron-compatible work last succeeded or failed.
