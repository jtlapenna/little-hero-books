-- Migration: Print fulfillment timestamps and tracking_url
-- Purpose: Add columns so W4 and Lulu webhook can populate print_submitted_at,
--          print_fulfillment_started_at, print_fulfillment_finished_at, and tracking_url.
-- Run this if your orders table was created from little-hero-books-schema.sql
-- (which has print_submitted_at but not the fulfillment timestamps or tracking_url).

-- Optional: tracking_url (Lulu webhook can store tracking URL here)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

COMMENT ON COLUMN orders.tracking_url IS 'Shipping tracking URL from Lulu (when shipped)';

-- Print fulfillment lifecycle (W4 sets started; Lulu webhook sets finished when SHIPPED)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS print_fulfillment_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS print_fulfillment_finished_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.print_fulfillment_started_at IS 'When W4 began print fulfillment (set by n8n Supabase: mark start)';
COMMENT ON COLUMN orders.print_fulfillment_finished_at IS 'When Lulu reported SHIPPED (set by Lulu webhook)';

-- Ensure print_submitted_at exists (some schemas already have it)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS print_submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.print_submitted_at IS 'When order was submitted to Lulu (set by n8n Supabase: mark submitted)';

-- Amazon shipping tier (Expedited, Standard, etc.) so W4 can send faster Lulu shipping when customer paid for it
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amazon_shipment_service_level VARCHAR(50);

COMMENT ON COLUMN orders.amazon_shipment_service_level IS 'Amazon ShipmentServiceLevelCategory or ShipServiceLevel; used by W4 to set Lulu shipping_level (EXPRESS/EXPEDITED/GROUND/MAIL)';
