-- Verify D2C shipping tier columns exist
-- Run after migration-d2c-shipping-tier.sql

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
    'shipping_tier',
    'shipping_tier_resolved',
    'shipping_tier_resolved_reason'
  )
ORDER BY column_name;
