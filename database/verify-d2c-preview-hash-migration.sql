-- Verify D2C Preview Hash Migration
-- Run this after migration-d2c-preview-hash.sql to confirm columns exist

-- Check preview_hash column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'orders'
  AND column_name IN ('preview_hash', 'display_order_id')
ORDER BY column_name;

-- Check index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders'
  AND indexname = 'idx_orders_display_order_id';

-- Show a sample of D2C orders with the new columns (if any exist)
SELECT 
  "orderId",
  display_order_id,
  preview_hash,
  character_hash,
  platform
FROM orders
WHERE platform = 'd2c'
LIMIT 5;
