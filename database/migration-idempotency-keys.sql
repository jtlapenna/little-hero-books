-- D2C Phase 0: Idempotency keys for checkout and Stripe webhook
-- See: docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md Section 3

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint TEXT,
  ttl_hours INTEGER DEFAULT 24
);

COMMENT ON TABLE idempotency_keys IS 'Stores idempotency key → response for checkout and Stripe webhook; keys older than ttl_hours can be purged.';
COMMENT ON COLUMN idempotency_keys.key IS 'Idempotency key (e.g. Idempotency-Key header or Stripe event.id)';
COMMENT ON COLUMN idempotency_keys.response_status IS 'HTTP status code of stored response';
COMMENT ON COLUMN idempotency_keys.response_body IS 'Stored response body (replayed on duplicate key within TTL)';
COMMENT ON COLUMN idempotency_keys.created_at IS 'When key was first used; used for TTL purge';

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);
