ALTER TABLE raw_event_dedupe ADD COLUMN aggregate_applied_at TEXT;

ALTER TABLE aggregates ADD COLUMN last_event_context_json TEXT;

ALTER TABLE aggregate_deliveries ADD COLUMN dimensions_hash TEXT NOT NULL DEFAULT 'd0';
ALTER TABLE aggregate_deliveries ADD COLUMN dimensions_json TEXT;

DROP INDEX IF EXISTS ux_aggregate_delivery_once;
CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregate_delivery_once
ON aggregate_deliveries(subscriber_id, signal_id, bucket_type, bucket_start_at, dimensions_hash);
