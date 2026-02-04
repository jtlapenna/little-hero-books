-- D2C Preview Hash and Display Order ID Migration
-- Required for D2C order backend fixes:
-- 1. preview_hash: Stores hash of visual traits for copying preview to pose 0
-- 2. display_order_id: Customer-friendly order ID (e.g., LH-A60AD)
--
-- Safe to run multiple times: ADD COLUMN IF NOT EXISTS

-- Add preview_hash column for storing visual trait hash
-- Used to locate D2C preview images and copy them to character hash location
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preview_hash VARCHAR(32);
COMMENT ON COLUMN orders.preview_hash IS 'MD5 hash of visual traits (16 chars). Used to locate D2C preview images for copying to pose 0.';

-- Add display_order_id column for customer-friendly order IDs
-- Format: LH-XXXXX (first 5 chars of UUID, uppercase)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS display_order_id VARCHAR(20);
COMMENT ON COLUMN orders.display_order_id IS 'Customer-friendly order ID for D2C orders (e.g., LH-A60AD). Null for Amazon orders.';

-- Create index on display_order_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_display_order_id ON orders(display_order_id) WHERE display_order_id IS NOT NULL;
