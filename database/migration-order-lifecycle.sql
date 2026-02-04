-- Migration: Order Lifecycle and Archiving System
-- Date: 2026-02-04
-- Purpose: Add lifecycle management columns and archived_orders table
-- See: docs/_ongoing-issues-list/15-order-archiving-and-lifecycle-management.md

-- ========================================
-- Part 1: Add lifecycle columns to orders table
-- ========================================

-- lifecycle_status: 'active' | 'recently_delivered' (orders stay in orders table)
-- When archived, order moves to archived_orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active';

-- Assumed delivery date (calculated from shipped_at + shipping level delay)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS assumed_delivered_at TIMESTAMPTZ;

-- Add indexes for lifecycle queries
CREATE INDEX IF NOT EXISTS idx_orders_lifecycle_status ON orders(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_orders_lifecycle_lulu ON orders(lifecycle_status, lulu_status);

COMMENT ON COLUMN orders.lifecycle_status IS 'Order lifecycle: active | recently_delivered. Archived orders move to archived_orders table.';
COMMENT ON COLUMN orders.assumed_delivered_at IS 'Assumed delivery date based on shipped_at + shipping level delay (Lulu does not provide delivery confirmation).';

-- ========================================
-- Part 2: Create archived_orders table
-- Mirrors orders table structure + archive metadata
-- ========================================

CREATE TABLE IF NOT EXISTS archived_orders (
    -- Primary key and identifiers
    id SERIAL PRIMARY KEY,
    amazon_order_id VARCHAR(50),
    "orderId" VARCHAR(100),
    platform VARCHAR(20) DEFAULT 'amazon',
    processing_id VARCHAR(100),
    
    -- Order Status & Workflow Tracking
    status VARCHAR(50),
    execution_status VARCHAR(50),
    workflow_step VARCHAR(50),
    next_workflow VARCHAR(50),
    current_workflow VARCHAR(50),
    
    -- Amazon Order Data
    order_status VARCHAR(20),
    purchase_date TIMESTAMP,
    order_total DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    marketplace_id VARCHAR(20),
    
    -- Customer Information
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    shipping_address JSONB,
    
    -- Legacy shipping columns (camelCase)
    "shippingName" VARCHAR(100),
    "shippingAddress1" VARCHAR(200),
    "shippingAddress2" VARCHAR(200),
    "shippingCity" VARCHAR(100),
    "shippingState" VARCHAR(50),
    "shippingZip" VARCHAR(20),
    "shippingCountry" VARCHAR(10) DEFAULT 'US',
    "shippingPhone" VARCHAR(20),
    "shippingEmail" VARCHAR(100),
    
    -- Character Specifications
    character_specs JSONB,
    character_hash VARCHAR(100),
    
    -- Legacy character columns (camelCase)
    "childName" VARCHAR(100),
    "childAge" INTEGER,
    "childHair" VARCHAR(20),
    "childSkin" VARCHAR(20),
    "childPronouns" VARCHAR(20),
    "favoriteAnimal" VARCHAR(50),
    "favoriteFood" VARCHAR(50),
    "favoriteColor" VARCHAR(20),
    hometown VARCHAR(100),
    occasion VARCHAR(50),
    dedication TEXT,
    dedication_text TEXT,
    
    -- Product Information
    product_info JSONB,
    
    -- Processing Metadata
    priority VARCHAR(20) DEFAULT 'normal',
    estimated_processing_time VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    started_at TIMESTAMP,
    queued_at TIMESTAMP,
    validated_at TIMESTAMP,
    
    -- Legacy timestamps (camelCase)
    "createdAt" TIMESTAMP,
    "updatedAt" TIMESTAMP,
    "shippedAt" TIMESTAMP,
    "estimatedDelivery" TIMESTAMP,
    
    -- Validation & Quality
    validation_errors JSONB DEFAULT '[]',
    quality_score DECIMAL(3,2),
    requires_human_review BOOLEAN DEFAULT FALSE,
    human_approved BOOLEAN,
    human_reviewed_at TIMESTAMP,
    human_reviewer VARCHAR(100),
    qa_notes TEXT,
    
    -- Regeneration & Feedback System
    regeneration_attempt INTEGER DEFAULT 0,
    regeneration_instructions TEXT,
    quality_issues JSONB DEFAULT '[]',
    previous_character_images JSONB DEFAULT '[]',
    rejection_history JSONB DEFAULT '[]',
    
    -- File URLs & Storage
    final_book_url TEXT,
    cover_image_url TEXT,
    thumbnail_url TEXT,
    one_manifest_url TEXT,
    manifest_2a_url TEXT,
    manifest_2b_url TEXT,
    manifest_3_url TEXT,
    manifest_4_url TEXT,
    
    -- Legacy file URL columns (camelCase)
    "bookPdfUrl" TEXT,
    "coverPdfUrl" TEXT,
    "thumbUrl" TEXT,
    "podOrderId" VARCHAR(50),
    
    -- Print & Fulfillment
    lulu_job_id VARCHAR(100),
    lulu_status VARCHAR(50),
    print_submitted_at TIMESTAMPTZ,
    print_fulfillment_started_at TIMESTAMPTZ,
    print_fulfillment_finished_at TIMESTAMPTZ,
    tracking_number VARCHAR(100),
    carrier VARCHAR(50),
    tracking_url TEXT,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    amazon_shipment_service_level VARCHAR(50),
    
    -- Legacy tracking columns (camelCase)
    "trackingNumber" VARCHAR(100),
    "trackingUrl" TEXT,
    
    -- Cost Tracking
    ai_generation_cost DECIMAL(10,2) DEFAULT 0.00,
    print_cost DECIMAL(10,2) DEFAULT 0.00,
    total_cost DECIMAL(10,2) DEFAULT 0.00,
    
    -- Review & Approval System
    review_stages JSONB,
    has_flags BOOLEAN DEFAULT FALSE,
    flags JSONB,
    customer_approval_status VARCHAR(50),
    customer_approval_required BOOLEAN DEFAULT FALSE,
    customer_approval_requested_at TIMESTAMP,
    customer_approval_approved_at TIMESTAMP,
    revision_count INTEGER DEFAULT 0,
    preview_reminder_sent VARCHAR(50),
    
    -- Skip tracking
    last_skip_reason TEXT,
    last_skip_at TIMESTAMPTZ,
    last_skip_details JSONB,
    
    -- Lifecycle columns (copied from orders)
    lifecycle_status TEXT,
    assumed_delivered_at TIMESTAMPTZ,
    
    -- ========================================
    -- Archive-specific columns
    -- ========================================
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archive_reason TEXT NOT NULL,  -- 'manual' | 'auto_delivered' | 'auto_cancelled'
    archived_by TEXT,              -- admin user ID for manual archives (NULL for auto)
    
    -- Ensure orderId is unique in archive
    CONSTRAINT archived_orders_order_id_unique UNIQUE ("orderId")
);

-- ========================================
-- Part 3: Create indexes for archived_orders
-- ========================================

-- Search indexes
CREATE INDEX IF NOT EXISTS idx_archived_orders_search 
  ON archived_orders("orderId", "childName", customer_name);

CREATE INDEX IF NOT EXISTS idx_archived_orders_platform 
  ON archived_orders(platform, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_archived_orders_date 
  ON archived_orders(archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_archived_orders_reason 
  ON archived_orders(archive_reason);

-- Comments
COMMENT ON TABLE archived_orders IS 'Archived orders - moved from orders table after delivery + 15 days or manual archive. Full copy of order data preserved.';
COMMENT ON COLUMN archived_orders.archived_at IS 'When order was archived';
COMMENT ON COLUMN archived_orders.archive_reason IS 'Why order was archived: manual, auto_delivered, auto_cancelled';
COMMENT ON COLUMN archived_orders.archived_by IS 'Admin user ID for manual archives (NULL for auto-archives)';

-- ========================================
-- Verification Queries
-- ========================================

-- Verify lifecycle columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('lifecycle_status', 'assumed_delivered_at')
ORDER BY column_name;

-- Verify archived_orders table was created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'archived_orders';

-- Verify indexes were created
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('orders', 'archived_orders')
  AND indexname LIKE '%lifecycle%' OR indexname LIKE '%archived%';
