CREATE TABLE IF NOT EXISTS signal_consumer_inbox (
  consumer_name text NOT NULL CHECK (length(trim(consumer_name)) BETWEEN 1 AND 200),
  message_id text NOT NULL CHECK (length(trim(message_id)) BETWEEN 1 AND 500),
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer_name, message_id)
);

CREATE INDEX IF NOT EXISTS signal_consumer_inbox_processed_at
  ON signal_consumer_inbox (processed_at);

COMMENT ON TABLE signal_consumer_inbox IS
  'Transactional deduplication records for at-least-once Signal event consumers.';
