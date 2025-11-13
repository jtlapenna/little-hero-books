-- Migration: Add manifest_4_url column for Workflow 4 (Print Fulfillment)
-- Date: 2025-11-13
-- Purpose: Store URL to 4-manifest.json (print fulfillment manifest)

-- Add manifest_4_url column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_4_url TEXT;

-- Add helpful comment
COMMENT ON COLUMN orders.manifest_4_url IS 'URL to R2 manifest for Workflow 4 (print fulfillment)';

