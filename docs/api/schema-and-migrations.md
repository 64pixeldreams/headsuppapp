# Schema And Migrations

Fresh-install schema entrypoint:

```text
apps/headsupp-api/migrations/fresh/schema.sql
```

Legacy upgrade patches for older deployed databases:

```text
apps/headsupp-api/migrations/legacy/0002_correctness_closure.sql
apps/headsupp-api/migrations/legacy/0003_channel_contracts_and_read_apis.sql
apps/headsupp-api/migrations/legacy/0004_watch_actions_and_quiet_summaries.sql
apps/headsupp-api/migrations/legacy/0005_correctness_closure_runtime.sql
apps/headsupp-api/migrations/legacy/0006_channel_metadata.sql
apps/headsupp-api/migrations/legacy/0007_email_subscribers.sql
```

It creates the operational core API tables required by the product spec:

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
aggregate_deliveries: subscriber_id + signal_id + bucket_type + bucket_start_at + dimensions_hash unique
raw_event_dedupe: idempotency_key primary key
channel_contracts: active channel contract plus archived version history
watch_action_controls: durable snooze, mute, resume, and ignore controls
quiet_summary_deliveries: scheduled proof-of-silence delivery rows
control_plane_audit_logs: request/action/actor/target metadata only, no secrets
operational_status: one row per operator health signal
```

Supported aggregate `bucket_type` values are `minute`, `hour`, `day`, `week`, and `month`. Week buckets use a UTC Monday boundary.

These constraints are required for idempotency, atomic aggregate upsert, and duplicate-safe aggregate forwarding.

`control_plane_audit_logs` records low-volume admin/operator actions. It must not contain raw API keys, connector secrets, Slack webhook URLs, generic webhook destination URLs, or raw event payloads.

`operational_status` records small status rows such as `scheduled_tasks`. It is used by observability to report whether cron-compatible work last succeeded or failed.

`legacy/0002_correctness_closure.sql` adds for older databases:

```text
aggregates.dimensions_hash
raw_event_dedupe.status
raw_event_dedupe.processing_started_at
raw_event_dedupe.processed_at
raw_event_dedupe.updated_at
```

`legacy/0003_channel_contracts_and_read_apis.sql` adds the `channel_contracts` table and indexes used by admin contract CRUD, signal default inheritance, and watch-template materialization. Alert and watch-state read APIs use existing `alerts`, `watches`, and `watch_states` rows and do not require a separate read-model table.

`legacy/0004_watch_actions_and_quiet_summaries.sql` adds `watch_action_controls` and `quiet_summary_deliveries`. These power manual attention controls and scheduled proof-of-silence delivery without creating normal alert rows.

`legacy/0005_correctness_closure_runtime.sql` adds aggregate-applied idempotency staging, latest aggregate context preservation, and dimension-safe aggregate-forward delivery identity.

`legacy/0006_channel_metadata.sql` adds `channels.metadata_json` for channel-level metadata echoed in callback payloads.

`legacy/0007_email_subscribers.sql` adds `subscribers.normalized_destination` and lookup indexing used by email subscriber disable/delete and unsubscribe flows.
