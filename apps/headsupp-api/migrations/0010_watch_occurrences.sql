CREATE TABLE IF NOT EXISTS watch_occurrences (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  occurrence_key TEXT NOT NULL,
  alert_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_occurrences_unique
ON watch_occurrences(workspace_id, channel_id, watch_id, occurrence_key);

CREATE INDEX IF NOT EXISTS idx_watch_occurrences_watch_seen
ON watch_occurrences(watch_id, last_seen_at);
