-- =============================================
-- Migration: Add W0/W1.1 Support Fields
-- Date: 2025-01-09
-- Purpose: Add required fields for Workflow 0 (Order Intake) and Workflow 1.1 (Router)
-- Safety: Uses IF NOT EXISTS - safe to run on existing database
-- =============================================

-- Add execution_status column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'ready_for_processing';

-- Add started_at column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- Add current_workflow column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_workflow VARCHAR(50);

-- Add one_manifest_url column (for 1-manifest from W0)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS one_manifest_url TEXT;

-- Add dedication_text column (extracted from character_specs for easier access)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dedication_text TEXT;

-- =============================================
-- Add Indexes for Performance
-- =============================================

-- Index for execution_status queries (optimized for W1.1 router)
CREATE INDEX IF NOT EXISTS idx_orders_execution_status_priority_queued 
  ON orders(execution_status, priority DESC NULLS LAST, queued_at ASC);

-- Partial index for ready_for_processing (faster queries for router)
CREATE INDEX IF NOT EXISTS idx_orders_ready_for_processing 
  ON orders(priority DESC NULLS LAST, queued_at ASC) 
  WHERE execution_status = 'ready_for_processing';

-- =============================================
-- Add Column Comments
-- =============================================

COMMENT ON COLUMN orders.execution_status IS 'Order execution status: ready_for_processing, processing, done, error';
COMMENT ON COLUMN orders.started_at IS 'Timestamp when order started processing (set when execution_status changes to processing)';
COMMENT ON COLUMN orders.current_workflow IS 'Currently executing workflow (2A, 2B, 3, etc.)';
COMMENT ON COLUMN orders.one_manifest_url IS 'URL to 1-manifest.json (from Workflow 0)';
COMMENT ON COLUMN orders.dedication_text IS 'Dedication text from order (extracted from character_specs for easier access)';

