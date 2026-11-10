-- Pending reservations must have a finite lease and a generation-specific token.
ALTER TABLE signal_idempotency_records
  ADD COLUMN IF NOT EXISTS reservation_token uuid,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

UPDATE signal_idempotency_records
SET reservation_token = gen_random_uuid(),
    reservation_expires_at = COALESCE(reservation_expires_at, now() + interval '5 minutes')
WHERE status = 'pending'
  AND (reservation_token IS NULL OR reservation_expires_at IS NULL);

UPDATE signal_idempotency_records
SET reservation_token = NULL, reservation_expires_at = NULL
WHERE status <> 'pending';

ALTER TABLE signal_idempotency_records
  DROP CONSTRAINT IF EXISTS signal_idempotency_reservation_lease_consistency;

ALTER TABLE signal_idempotency_records
  ADD CONSTRAINT signal_idempotency_reservation_lease_consistency CHECK (
    (status = 'pending' AND reservation_token IS NOT NULL AND reservation_expires_at IS NOT NULL)
    OR
    (status <> 'pending' AND reservation_token IS NULL AND reservation_expires_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS signal_idempotency_expired_reservations
  ON signal_idempotency_records (reservation_expires_at)
  WHERE status = 'pending';
