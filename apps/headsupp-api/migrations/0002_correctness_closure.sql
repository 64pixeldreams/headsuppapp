ALTER TABLE aggregates ADD COLUMN dimensions_hash TEXT NOT NULL DEFAULT 'd0';

DROP INDEX IF EXISTS ux_aggregates_signal_bucket;
CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregates_signal_bucket ON aggregates(signal_id, bucket_type, bucket_start_at, dimensions_hash);

ALTER TABLE raw_event_dedupe ADD COLUMN status TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE raw_event_dedupe ADD COLUMN processing_started_at TEXT;
ALTER TABLE raw_event_dedupe ADD COLUMN processed_at TEXT;
ALTER TABLE raw_event_dedupe ADD COLUMN updated_at TEXT;
