-- D2C Phase 0: Dual-channel orders (platform, orderId, nullable amazon_order_id)
-- See: docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md
--
-- Assumptions: orders PK = id; amazon_order_id (snake_case) exists.
-- Safe to run: ADD COLUMN IF NOT EXISTS skips platform/orderId if present; backfill no-ops when orderId already set; DROP NOT NULL only runs when amazon_order_id is currently NOT NULL.

-- 2.2.1 Add platform column
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'amazon';
COMMENT ON COLUMN orders.platform IS 'Order origin: amazon | d2c. Used for notifications and reporting.';

-- 2.2.2 Add orderId if not present (business key; D2C = UUID, Amazon = same as amazon_order_id)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "orderId" VARCHAR(100);
COMMENT ON COLUMN orders."orderId" IS 'Business key for order. For Amazon same as amazon_order_id; for D2C use UUID.';

-- 2.2.3 Backfill orderId from amazon_order_id for existing rows
UPDATE orders SET "orderId" = amazon_order_id WHERE "orderId" IS NULL AND amazon_order_id IS NOT NULL;

-- 2.2.4 Make amazon_order_id nullable (required for D2C orders which have no Amazon ID)
-- Skip if already nullable (e.g. your DB was altered earlier).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'amazon_order_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE orders ALTER COLUMN amazon_order_id DROP NOT NULL;
  END IF;
END $$;
