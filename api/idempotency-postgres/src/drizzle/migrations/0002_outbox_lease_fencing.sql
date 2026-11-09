-- A worker identity is not a lease identity: process restarts may reuse worker IDs.
-- Every claim receives a fresh token so an expired worker cannot acknowledge
-- or reschedule a later generation of the same message.
ALTER TABLE signal_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid;

UPDATE signal_outbox
SET lease_token = gen_random_uuid()
WHERE status = 'processing' AND lease_token IS NULL;

ALTER TABLE signal_outbox
  DROP CONSTRAINT IF EXISTS signal_outbox_lease_token_consistency;

ALTER TABLE signal_outbox
  ADD CONSTRAINT signal_outbox_lease_token_consistency CHECK (
    (status = 'processing' AND lease_token IS NOT NULL)
    OR
    (status <> 'processing' AND lease_token IS NULL)
  );
