-- D2C Shipping Tier Persistence + W4 Resolution Audit
-- Purpose:
--   1) Persist the D2C checkout shipping tier on orders (`shipping_tier`)
--   2) Record what W4 actually used for Lulu (`shipping_tier_resolved` + optional reason)
-- Safe to run multiple times: ADD COLUMN IF NOT EXISTS

-- Persist original tier from D2C checkout (e.g. mail|ground_home|priority_mail|expedited|express)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_tier TEXT;

COMMENT ON COLUMN orders.shipping_tier IS 'D2C checkout shipping tier: mail|ground_home|priority_mail|expedited|express. Null for Amazon orders.';

-- Audit: what W4 resolved to for Lulu shipping_level (MAIL|GROUND|PRIORITY_MAIL|EXPEDITED|EXPRESS)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_tier_resolved TEXT;

COMMENT ON COLUMN orders.shipping_tier_resolved IS 'Resolved Lulu shipping_level used by W4 (MAIL|GROUND|PRIORITY_MAIL|EXPEDITED|EXPRESS).';

-- Optional but useful: why W4 chose it (amazon vs d2c_tier vs fallback)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_tier_resolved_reason TEXT;

COMMENT ON COLUMN orders.shipping_tier_resolved_reason IS 'How shipping_tier_resolved was chosen: amazon|d2c_tier|fallback_default|fallback_unknown.';
