-- Purpose: allow sibling rows to share one Amazon root ID.
-- Pseudocode:
-- 1) Remove uniqueness enforced on orders.amazon_order_id.
-- 2) Keep lookup performance via non-unique btree index.
-- 3) Preserve per-book uniqueness through existing orderId unique index.

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_amazon_order_id_key;

CREATE INDEX IF NOT EXISTS idx_orders_amazon_order_id
ON public.orders (amazon_order_id);
