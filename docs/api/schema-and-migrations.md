# Schema And Migrations

The core D1 schema lives in:

```text
apps/headsupp-api/migrations/0001_headsupp_core.sql
apps/headsupp-api/migrations/0002_correctness_closure.sql
apps/headsupp-api/migrations/0003_channel_contracts_and_read_apis.sql
apps/headsupp-api/migrations/0004_watch_actions_and_quiet_summaries.sql
```

It creates the MVP tables required by the product spec:

```text
workspaces
channels
channel_contracts
connectors
subscribers
signals
signal_contracts
watches
watch_action_controls
watch_states
aggregates
raw_event_dedupe
alerts
alert_deliveries
quiet_summary_deliveries
aggregate_deliveries
control_plane_audit_logs
operational_status
```

Important constraints:

```text
signals: channel_id + signal_key unique
aggregates: signal_id + bucket_type + bucket_start_at + dimensions_hash unique
aggregate_deliveries: subscriber_id + signal_id + bucket_type + bucket_start_at unique
raw_event_dedupe: idempotency_key primary key
channel_contracts: active channel contract plus archived version history
watch_action_controls: durable snooze, mute, resume, and ignore controls
quiet_summary_deliveries: scheduled proof-of-silence delivery rows
control_plane_audit_logs: request/action/actor/target metadata only, no secrets
operational_status: one row per operator health signal
```

These constraints are required for idempotency, atomic aggregate upsert, and duplicate-safe aggregate forwarding.

`control_plane_audit_logs` records low-volume admin/operator actions. It must not contain raw API keys, connector secrets, Slack webhook URLs, generic webhook destination URLs, or raw event payloads.

`operational_status` records small status rows such as `scheduled_tasks`. It is used by observability to report whether cron-compatible work last succeeded or failed.

`0002_correctness_closure.sql` adds:

```text
aggregates.dimensions_hash
raw_event_dedupe.status
raw_event_dedupe.processing_started_at
raw_event_dedupe.processed_at
raw_event_dedupe.updated_at
```

`0003_channel_contracts_and_read_apis.sql` adds the `channel_contracts` table and indexes used by admin contract CRUD, signal default inheritance, and watch-template materialization. Alert and watch-state read APIs use existing `alerts`, `watches`, and `watch_states` rows and do not require a separate read-model table.

`0004_watch_actions_and_quiet_summaries.sql` adds `watch_action_controls` and `quiet_summary_deliveries`. These power manual attention controls and scheduled proof-of-silence delivery without creating normal alert rows.
