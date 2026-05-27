ALTER TABLE subscribers ADD COLUMN subscriber_scope TEXT NOT NULL DEFAULT 'channel';

CREATE INDEX IF NOT EXISTS idx_subscribers_workspace_scope
  ON subscribers(workspace_id, subscriber_scope, mode, subscriber_type);
