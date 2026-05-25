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
