-- Migration: Simplified archived_orders table using JSONB
-- Date: 2026-02-04
-- Purpose: Use JSONB to store full order data, avoiding column mismatch issues

-- Drop the existing table
DROP TABLE IF EXISTS archived_orders;

-- Create a simplified archived_orders table that stores order data as JSONB
-- This avoids having to match every column in the orders table
CREATE TABLE archived_orders (
    id SERIAL PRIMARY KEY,
    
    -- Key identifiers for searching (extracted from order_data for indexing)
    order_id VARCHAR(100),           -- The orderId value
    amazon_order_id VARCHAR(50),     -- The amazonOrderId value
    platform VARCHAR(50),
    customer_email VARCHAR(255),
    
    -- Full order data as JSONB (stores ALL columns from orders table)
    order_data JSONB NOT NULL,
    
    -- Archive metadata
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archive_reason TEXT NOT NULL,    -- 'manual', 'auto_delivered', 'auto_cancelled'
    archived_by TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT archived_orders_order_id_unique UNIQUE (order_id)
);

-- Create indexes for efficient querying
CREATE INDEX idx_archived_orders_order_id ON archived_orders (order_id);
CREATE INDEX idx_archived_orders_amazon_id ON archived_orders (amazon_order_id);
CREATE INDEX idx_archived_orders_platform ON archived_orders (platform);
CREATE INDEX idx_archived_orders_date ON archived_orders (archived_at DESC);
CREATE INDEX idx_archived_orders_reason ON archived_orders (archive_reason);
CREATE INDEX idx_archived_orders_email ON archived_orders (customer_email);

-- GIN index for searching within order_data JSONB
CREATE INDEX idx_archived_orders_data ON archived_orders USING GIN (order_data);

-- Add comments
COMMENT ON TABLE archived_orders IS 'Archived orders moved from main orders table for historical reference';
COMMENT ON COLUMN archived_orders.order_data IS 'Full order data stored as JSONB';
COMMENT ON COLUMN archived_orders.archived_at IS 'Timestamp when order was archived';
COMMENT ON COLUMN archived_orders.archive_reason IS 'Reason for archiving: manual, auto_delivered, auto_cancelled';
