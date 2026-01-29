-- Track which Amazon preview reminder was last sent so the cron doesn't double-send.
-- Values: 'reminder-day-1' | 'reminder-day-2' | 'auto-approval' (null = only initial sent).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preview_reminder_sent VARCHAR(50);

COMMENT ON COLUMN orders.preview_reminder_sent IS 'Last Amazon preview reminder sent: reminder-day-1, reminder-day-2, or auto-approval. Null = only initial message sent.';
