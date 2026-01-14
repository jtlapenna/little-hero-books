-- Migration: Add skip tracking fields to orders table
-- Date: 2026-01-14
-- Purpose: Track when workflows skip all poses (already processed)

-- Add columns for tracking workflow skip events
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS last_skip_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_skip_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_skip_details JSONB;

-- Add index for querying orders by skip reason
CREATE INDEX IF NOT EXISTS idx_orders_last_skip_reason ON orders(last_skip_reason) WHERE last_skip_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_last_skip_at ON orders(last_skip_at) WHERE last_skip_at IS NOT NULL;
