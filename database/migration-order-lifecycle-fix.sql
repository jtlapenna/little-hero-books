-- Migration: Fix archived_orders table column names to match orders table
-- Date: 2026-02-04
-- Purpose: Recreate archived_orders table with camelCase column names matching orders table

-- Drop the incorrectly-named table
DROP TABLE IF EXISTS archived_orders;

-- Recreate archived_orders with matching column names from orders table
-- This table mirrors ALL columns from orders, plus archive metadata
CREATE TABLE IF NOT EXISTS archived_orders (
    id SERIAL PRIMARY KEY,
    
    -- Core identifiers (matching orders table)
    "orderId" VARCHAR(100),
    "amazonOrderId" VARCHAR(50),
    amazon_order_id VARCHAR(50),  -- Some orders use this variant
    order_id VARCHAR(100),        -- Some orders use this variant
    platform VARCHAR(50),
    
    -- Customer info
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    
    -- Character specs
    character_specs JSONB,
    character_hash VARCHAR(64),
    
    -- Book specs
    book_specs JSONB,
    
    -- Shipping
    shipping_address JSONB,
    amazon_shipment_service_level VARCHAR(50),
    
    -- Dedication
    dedication_text TEXT,
    
    -- Status and workflow
    status VARCHAR(100),
    order_status VARCHAR(50),
    execution_status VARCHAR(50),
    workflow_step VARCHAR(100),
    current_workflow VARCHAR(50),
    next_workflow VARCHAR(50),
    
    -- Review stages
    review_stages JSONB,
    
    -- Customer approval
    customer_approval_status VARCHAR(50),
    customer_approval_required BOOLEAN,
    customer_approval_requested_at TIMESTAMPTZ,
    customer_approval_approved_at TIMESTAMPTZ,
    
    -- Revision tracking
    revision_count INTEGER DEFAULT 0,
    
    -- Flags
    has_flags BOOLEAN DEFAULT FALSE,
    flags JSONB,
    
    -- Error tracking
    error_message TEXT,
    error_type VARCHAR(100),
    retry_count INTEGER DEFAULT 0,
    
    -- Manifest URLs
    one_manifest_url TEXT,
    manifest_2a_url TEXT,
    manifest_2b_url TEXT,
    manifest_3_url TEXT,
    manifest_4_url TEXT,
    
    -- Final outputs
    final_book_url TEXT,
    final_cover_url TEXT,
    thumb_url TEXT,
    
    -- Lulu / Print fulfillment
    lulu_job_id VARCHAR(100),
    lulu_status VARCHAR(50),
    lulu_cost DECIMAL(10, 2),
    lulu_estimated_ship_date TIMESTAMPTZ,
    lulu_tracking_number VARCHAR(100),
    lulu_tracking_url TEXT,
    lulu_carrier VARCHAR(100),
    lulu_submitted_at TIMESTAMPTZ,
    lulu_status_history JSONB,
    shipped_at TIMESTAMPTZ,
    
    -- Processing timestamps
    started_at TIMESTAMPTZ,
    queued_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    purchase_date TIMESTAMPTZ,
    marketplace_id VARCHAR(50),
    
    -- Preview system
    preview_reminder_sent BOOLEAN DEFAULT FALSE,
    preview_reminder_sent_at TIMESTAMPTZ,
    
    -- Skip tracking
    last_skip_reason TEXT,
    last_skip_at TIMESTAMPTZ,
    last_skip_details JSONB,
    
    -- Product info
    product_info JSONB,
    
    -- Standard timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Lifecycle status (from orders table)
    lifecycle_status TEXT,
    assumed_delivered_at TIMESTAMPTZ,
    
    -- Archive metadata (new columns)
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archive_reason TEXT NOT NULL,
    archived_by TEXT,
    
    -- Unique constraint on orderId
    CONSTRAINT archived_orders_order_id_unique UNIQUE ("orderId")
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_archived_orders_search 
ON archived_orders ("orderId", amazon_order_id, "amazonOrderId");

CREATE INDEX IF NOT EXISTS idx_archived_orders_platform 
ON archived_orders (platform);

CREATE INDEX IF NOT EXISTS idx_archived_orders_date 
ON archived_orders (archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_archived_orders_reason 
ON archived_orders (archive_reason);

-- Add comments
COMMENT ON TABLE archived_orders IS 'Archived orders moved from main orders table for historical reference';
COMMENT ON COLUMN archived_orders.archived_at IS 'Timestamp when order was archived';
COMMENT ON COLUMN archived_orders.archive_reason IS 'Reason for archiving: manual, auto_delivered, auto_cancelled';
COMMENT ON COLUMN archived_orders.archived_by IS 'User or system that triggered the archive';
