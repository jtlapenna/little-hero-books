-- Lulu webhook audit log: see if webhook requests are reaching our backend (no reliance on Vercel logs).
-- Run once. Query: SELECT * FROM lulu_webhook_log ORDER BY received_at DESC LIMIT 50;

CREATE TABLE IF NOT EXISTS lulu_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  print_job_id TEXT,
  status_name TEXT,
  order_found BOOLEAN NOT NULL DEFAULT FALSE,
  order_id TEXT,
  updated BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_lulu_webhook_log_received_at ON lulu_webhook_log(received_at DESC);
COMMENT ON TABLE lulu_webhook_log IS 'One row per POST to /api/webhooks/lulu/status; use to verify Lulu webhook delivery.';
