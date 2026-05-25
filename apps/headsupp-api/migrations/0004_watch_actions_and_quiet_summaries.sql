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
