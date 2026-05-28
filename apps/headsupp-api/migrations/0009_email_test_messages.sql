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
