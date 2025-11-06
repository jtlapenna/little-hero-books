-- Migration: Status System Support
-- Date: 2025-01-XX
-- Purpose: Add review_stages, flags, and customer approval fields for new status system
-- Note: Uses existing fields: status, workflow_step, lulu_status (no duplicate fields added)

-- ========================================
-- Add Review Stages JSONB Field
-- ========================================
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS review_stages JSONB DEFAULT '{
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }'::jsonb;

COMMENT ON COLUMN orders.review_stages IS 'Stage-specific review status (preBria, postBria, postPdf)';

-- ========================================
-- Add Flags System
-- ========================================
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS has_flags BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{
    "preBria": 0,
    "postBria": 0,
    "postPdf": 0,
    "total": 0
  }'::jsonb;

COMMENT ON COLUMN orders.has_flags IS 'Whether order has any flagged images';
COMMENT ON COLUMN orders.flags IS 'Flag counts per stage (preBria, postBria, postPdf, total)';

-- ========================================
-- Add Customer Approval Fields
-- ========================================
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS customer_approval_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer_approval_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_approval_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS customer_approval_approved_at TIMESTAMP;

COMMENT ON COLUMN orders.customer_approval_status IS 'Customer approval status (pending, approved, revision_requested)';
COMMENT ON COLUMN orders.customer_approval_required IS 'Whether customer approval is required before printing';

-- ========================================
-- Add Production Tracking (if missing)
-- ========================================
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

COMMENT ON COLUMN orders.delivered_at IS 'When order was delivered to customer';

-- ========================================
-- Create Indexes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_orders_has_flags ON orders(has_flags);
CREATE INDEX IF NOT EXISTS idx_orders_customer_approval_status ON orders(customer_approval_status);
CREATE INDEX IF NOT EXISTS idx_orders_review_stages ON orders USING GIN (review_stages);
CREATE INDEX IF NOT EXISTS idx_orders_flags ON orders USING GIN (flags);

-- ========================================
-- Field Mapping Notes
-- ========================================
-- Existing fields used by status system:
--   - status: Main order status (calculated and updated)
--   - workflow_step: Current workflow stage (ai_generation, bria_processing, book_assembly, etc.)
--   - lulu_status: Production status from Lulu API
--   - lulu_job_id: Lulu print job ID
--   - tracking_number: Shipping tracking number
--   - carrier: Shipping carrier
--   - shipped_at: When order was shipped
--   - human_approved: Human reviewer approval (from migration-manifest-support.sql)
--   - character_hash: Character hash for caching (from migration-manifest-support.sql)
--   - manifest_2a_url, manifest_2b_url, manifest_3_url: Manifest URLs (from migration-manifest-support.sql)

-- ========================================
-- Verification Queries
-- ========================================

-- Verify columns were added
SELECT 
  column_name, 
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN (
    'review_stages', 
    'has_flags', 
    'flags', 
    'customer_approval_status',
    'customer_approval_required',
    'customer_approval_requested_at',
    'customer_approval_approved_at',
    'delivered_at'
  )
ORDER BY column_name;

-- Verify indexes were created
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename = 'orders' 
  AND indexname IN (
    'idx_orders_has_flags',
    'idx_orders_customer_approval_status',
    'idx_orders_review_stages',
    'idx_orders_flags'
  )
ORDER BY indexname;

-- Verify existing fields (should already exist)
SELECT 
  column_name, 
  data_type
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN (
    'status',
    'workflow_step',
    'lulu_status',
    'lulu_job_id',
    'tracking_number',
    'carrier',
    'shipped_at',
    'human_approved',
    'character_hash'
  )
ORDER BY column_name;

