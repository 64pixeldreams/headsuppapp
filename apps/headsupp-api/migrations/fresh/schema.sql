CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT UNIQUE,
  workspace_key TEXT UNIQUE,
  name TEXT NOT NULL,
  source_app TEXT,
  external_tenant_id TEXT,
  external_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  channel_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_key TEXT NOT NULL UNIQUE,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source_app TEXT,
  external_tenant_id TEXT,
  external_user_id TEXT,
  external_resource_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace_id ON channels(workspace_id);

CREATE TABLE IF NOT EXISTS channel_contracts (
  id TEXT PRIMARY KEY,
  channel_contract_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  purpose TEXT,
  expected_signal_types_json TEXT NOT NULL DEFAULT '[]',
  default_dimensions_json TEXT NOT NULL DEFAULT '[]',
  default_watch_templates_json TEXT NOT NULL DEFAULT '[]',
  cta_policy_json TEXT NOT NULL DEFAULT '{}',
  source_app TEXT,
  external_tenant_id TEXT,
  external_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_contracts_channel_status ON channel_contracts(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_channel_contracts_workspace ON channel_contracts(workspace_id, channel_id);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  connector_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  connector_key TEXT NOT NULL UNIQUE,
  secret_hash TEXT,
  connector_secret TEXT,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  enabled INTEGER NOT NULL DEFAULT 1,
  source_app TEXT,
  external_tenant_id TEXT,
  external_user_id TEXT,
  external_resource_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connectors_channel_id ON connectors(channel_id);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  subscriber_type TEXT NOT NULL,
  name TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  normalized_destination TEXT NOT NULL,
  destination_url_redacted TEXT,
  secret_hash TEXT,
  mode TEXT NOT NULL DEFAULT 'alert',
  config_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  subscriber_scope TEXT NOT NULL DEFAULT 'channel',
  source_app TEXT,
  external_tenant_id TEXT,
  external_user_id TEXT,
  external_resource_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscribers_channel_id ON subscribers(channel_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_lookup ON subscribers(channel_id, mode, subscriber_type, normalized_destination);
CREATE INDEX IF NOT EXISTS idx_subscribers_workspace_scope ON subscribers(workspace_id, subscriber_scope, mode, subscriber_type);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  signal_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  value_mode TEXT NOT NULL,
  unit TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_signals_channel_key ON signals(channel_id, signal_key);
CREATE INDEX IF NOT EXISTS idx_signals_channel_id ON signals(channel_id);

CREATE TABLE IF NOT EXISTS signal_contracts (
  id TEXT PRIMARY KEY,
  signal_contract_id TEXT UNIQUE,
  signal_id TEXT NOT NULL,
  contract_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY,
  watch_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  watch_group_id TEXT,
  band_key TEXT,
  name TEXT NOT NULL,
  watch_type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  cooldown_seconds INTEGER NOT NULL DEFAULT 86400,
  escalation_json TEXT,
  recovery_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watches_signal_id ON watches(signal_id);
CREATE INDEX IF NOT EXISTS idx_watches_channel_id ON watches(channel_id);
CREATE INDEX IF NOT EXISTS idx_watches_enabled ON watches(enabled);
CREATE INDEX IF NOT EXISTS idx_watches_group_id ON watches(watch_group_id);

CREATE TABLE IF NOT EXISTS watch_groups (
  id TEXT PRIMARY KEY,
  watch_group_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  name TEXT NOT NULL,
  winner_policy TEXT NOT NULL DEFAULT 'highest_severity_wins',
  cooldown_scope TEXT NOT NULL DEFAULT 'group',
  cooldown_seconds INTEGER NOT NULL DEFAULT 86400,
  recovery_json TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_watch_groups_channel_key ON watch_groups(channel_id, group_key);
CREATE INDEX IF NOT EXISTS idx_watch_groups_signal_id ON watch_groups(signal_id);

CREATE TABLE IF NOT EXISTS watch_action_controls (
  id TEXT PRIMARY KEY,
  action_id TEXT UNIQUE,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT,
  expires_at TEXT,
  actor_user_id TEXT,
  source_app TEXT,
  external_tenant_id TEXT,
  external_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watch_action_controls_target ON watch_action_controls(target_type, target_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_watch_action_controls_channel ON watch_action_controls(workspace_id, channel_id, created_at);

CREATE TABLE IF NOT EXISTS watch_states (
  watch_id TEXT PRIMARY KEY,
  last_status TEXT,
  last_evaluated_at TEXT,
  last_alert_at TEXT,
  last_alert_value REAL,
  last_alert_severity TEXT,
  cooldown_until TEXT,
  last_emitted_bucket_start_at TEXT,
  last_digest_at TEXT,
  last_recovery_at TEXT,
  state_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_group_states (
  watch_group_id TEXT PRIMARY KEY,
  last_status TEXT,
  last_evaluated_at TEXT,
  last_alert_at TEXT,
  last_alert_value REAL,
  last_alert_severity TEXT,
  cooldown_until TEXT,
  last_recovery_at TEXT,
  state_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aggregates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  signal_key TEXT,
  bucket_type TEXT NOT NULL,
  bucket_start_at TEXT NOT NULL,
  dimensions_hash TEXT NOT NULL DEFAULT 'd0',
  dimensions_json TEXT,
  last_event_context_json TEXT,
  sum_value REAL NOT NULL DEFAULT 0,
  count_value INTEGER NOT NULL DEFAULT 0,
  min_value REAL,
  max_value REAL,
  last_value REAL,
  avg_value REAL,
  first_event_at TEXT,
  last_event_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregates_signal_bucket ON aggregates(signal_id, bucket_type, bucket_start_at, dimensions_hash);
CREATE INDEX IF NOT EXISTS idx_aggregates_signal_bucket_time ON aggregates(signal_id, bucket_type, bucket_start_at);

CREATE TABLE IF NOT EXISTS raw_event_dedupe (
  idempotency_key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_key TEXT,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  processing_started_at TEXT,
  aggregate_applied_at TEXT,
  processed_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_event_dedupe_received_at ON raw_event_dedupe(received_at);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  severity TEXT NOT NULL,
  current_value REAL,
  threshold_value REAL,
  summary_text TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_watch_id ON alerts(watch_id);
CREATE INDEX IF NOT EXISTS idx_alerts_channel_id ON alerts(channel_id);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  response_code INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_status_next ON alert_deliveries(status, next_retry_at);

CREATE TABLE IF NOT EXISTS email_test_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  alert_id TEXT,
  delivery_id TEXT,
  recipient TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  received_json TEXT,
  status TEXT NOT NULL,
  sent_at TEXT,
  received_at TEXT,
  tested_at TEXT,
  failure_reason TEXT,
  provider_message_id TEXT,
  inbound_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_test_messages_run_case ON email_test_messages(run_id, case_id);
CREATE INDEX IF NOT EXISTS idx_email_test_messages_delivery ON email_test_messages(delivery_id);
CREATE INDEX IF NOT EXISTS idx_email_test_messages_status ON email_test_messages(status, updated_at);

CREATE TABLE IF NOT EXISTS quiet_summary_deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  response_code INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quiet_summary_deliveries_status_next ON quiet_summary_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_quiet_summary_deliveries_channel_created ON quiet_summary_deliveries(workspace_id, channel_id, created_at);

CREATE TABLE IF NOT EXISTS aggregate_deliveries (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  bucket_type TEXT NOT NULL,
  bucket_start_at TEXT NOT NULL,
  dimensions_hash TEXT NOT NULL DEFAULT 'd0',
  dimensions_json TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  response_code INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregate_delivery_once
ON aggregate_deliveries(subscriber_id, signal_id, bucket_type, bucket_start_at, dimensions_hash);

CREATE TABLE IF NOT EXISTS control_plane_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  actor_key_id TEXT,
  target_type TEXT,
  target_id TEXT,
  source_app TEXT,
  external_tenant_id TEXT,
  workspace_id TEXT,
  request_id TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_control_plane_audit_created_at ON control_plane_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_control_plane_audit_workspace ON control_plane_audit_logs(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS operational_status (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL
);
