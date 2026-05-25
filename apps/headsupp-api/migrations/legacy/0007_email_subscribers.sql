ALTER TABLE subscribers ADD COLUMN normalized_destination TEXT NOT NULL DEFAULT '';

UPDATE subscribers
SET normalized_destination = CASE
  WHEN subscriber_type = 'email' THEN lower(trim(destination_url))
  ELSE destination_url
END
WHERE normalized_destination = '' OR normalized_destination IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscribers_lookup
ON subscribers(channel_id, mode, subscriber_type, normalized_destination);
