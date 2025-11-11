-- Migration: Add error tracking fields to orders table
-- Run this in Supabase SQL editor

-- Add error tracking fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS error_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;

-- Add index for retry queries
CREATE INDEX IF NOT EXISTS idx_orders_next_retry_at ON orders(next_retry_at) 
WHERE next_retry_at IS NOT NULL AND execution_status = 'error';

-- Add index for error status queries
CREATE INDEX IF NOT EXISTS idx_orders_error_status ON orders(execution_status, retry_count) 
WHERE execution_status IN ('error', 'error_requires_manual_review');

