-- Purpose: make group-key semantics explicit across Amazon + D2C.
-- Pseudocode:
-- 1) Add root_order_id column (nullable for backward compatibility).
-- 2) Backfill from existing amazon_order_id values.
-- 3) Add index for group lookups.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS root_order_id text;

UPDATE public.orders
SET root_order_id = amazon_order_id
WHERE root_order_id IS NULL
  AND amazon_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_root_order_id
ON public.orders (root_order_id);
