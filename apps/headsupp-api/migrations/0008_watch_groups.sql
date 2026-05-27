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

ALTER TABLE watches ADD COLUMN watch_group_id TEXT;
ALTER TABLE watches ADD COLUMN band_key TEXT;

CREATE INDEX IF NOT EXISTS idx_watches_group_id ON watches(watch_group_id);

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
