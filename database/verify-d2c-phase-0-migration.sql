-- Verification for D2C Phase 0 migration (platform, orderId, nullable amazon_order_id)
-- Run after applying migration-d2c-phase-0-orders.sql

-- 1. Check orders.platform exists; default 'amazon'; existing rows unchanged
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'platform';

-- 2. Check orders.orderId exists; backfilled for existing Amazon orders
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'orderId';

-- Sample: rows with amazon_order_id set should have orderId = amazon_order_id
SELECT id, "orderId", amazon_order_id, platform
FROM orders
WHERE amazon_order_id IS NOT NULL
LIMIT 5;

-- 3. Check amazon_order_id is nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'amazon_order_id';

-- 4. Backend: list and detail APIs return platform and orderId (confirm via API; no SQL check)
