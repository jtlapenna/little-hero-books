-- Migration: Manifest Support and Character Generations Tracking
-- Date: 2025-01-XX
-- Purpose: Add manifest URL columns, character_generations table, and RPC functions
-- Required for Developer A's workflow integration

-- ========================================
-- Task 1: Add Manifest URL Columns to Orders
-- ========================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_2a_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_2b_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manifest_3_url TEXT;

-- Add helpful comment
COMMENT ON COLUMN orders.manifest_2a_url IS 'URL to R2 manifest for Workflow 2A (character generation)';
COMMENT ON COLUMN orders.manifest_2b_url IS 'URL to R2 manifest for Workflow 2B (background removal)';
COMMENT ON COLUMN orders.manifest_3_url IS 'URL to R2 manifest for Workflow 3 (book assembly)';

-- ========================================
-- Task 2: Create Missing Indexes
-- ========================================

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_character_hash ON orders(character_hash);
-- Note: amazonOrderId column uses camelCase in schema

-- ========================================
-- Task 3: Create Character Generations Table
-- ========================================

CREATE TABLE IF NOT EXISTS character_generations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  pose_number INTEGER NOT NULL CHECK (pose_number BETWEEN 1 AND 12),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  original_image_url TEXT,
  background_removed_url TEXT,
  final_image_url TEXT,
  quality_score DECIMAL(3,2),
  consistency_score DECIMAL(3,2),
  character_match_score DECIMAL(3,2),
  bria_request_id VARCHAR(100),
  bria_status VARCHAR(50),
  needs_manual_review BOOLEAN DEFAULT FALSE,
  manual_review_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(order_id, pose_number)
);

-- Add comment
COMMENT ON TABLE character_generations IS 'Tracks per-pose image generation status and quality scores';

-- Create indexes for character_generations
CREATE INDEX IF NOT EXISTS idx_character_generations_order_id ON character_generations(order_id);

-- ========================================
-- Task 4: Create/Update Human Review Queue Table
-- ========================================

CREATE TABLE IF NOT EXISTS human_review_queue (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  review_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  review_priority VARCHAR(20) DEFAULT 'normal',
  review_notes TEXT,
  decision VARCHAR(50),
  rejection_reason TEXT,
  assigned_to UUID,
  assigned_at TIMESTAMP,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE human_review_queue IS 'Queue for human review of AI-generated content at various stages';

-- Create indexes for human_review_queue
CREATE INDEX IF NOT EXISTS idx_human_review_queue_status ON human_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_human_review_queue_priority ON human_review_queue(review_priority);

-- Create conditional index for character_generations (only after column exists)
-- Note: We'll create this manually if needed, for now skipping to avoid transaction issues

-- ========================================
-- Task 5: Create RPC Function - Upsert from 2A Manifest
-- ========================================

CREATE OR REPLACE FUNCTION upsert_from_manifest_2a(p_order_id TEXT, p_manifest JSONB)
RETURNS VOID AS $$
DECLARE
  v_orders_id INTEGER;
  v_entry JSONB;
  v_pose INT;
BEGIN
  -- Find the order by id (primary key is 'id' in our actual schema)
  SELECT id INTO v_orders_id FROM orders 
  WHERE id = p_order_id::INTEGER
  LIMIT 1;

  IF v_orders_id IS NULL THEN
    RAISE EXCEPTION 'Order not found for %', p_order_id;
  END IF;

  -- Update the orders table with manifest 2A data
  UPDATE orders SET
    character_hash = p_manifest->>'characterHash',
    manifest_2a_url = COALESCE(p_manifest->'manifests'->>'2a', manifest_2a_url),
    status = '2a_review',
    workflow_step = 'ai_generation',
    next_workflow = '2b-retry',
    updated_at = NOW()
  WHERE id = v_orders_id;

  -- Loop through entries and upsert into character_generations
  FOR v_entry IN SELECT jsonb_array_elements(p_manifest->'entries') LOOP
    v_pose := (v_entry->>'poseNumber')::INT;
    
    INSERT INTO character_generations (
      order_id, pose_number, status, original_image_url,
      quality_score, consistency_score, character_match_score,
      needs_manual_review, manual_review_reason
    ) VALUES (
      v_orders_id,
      v_pose,
      COALESCE(v_entry->>'status','generated'),
      v_entry->>'publicUrl',
      NULLIF(v_entry->>'qaScore','')::DECIMAL,
      NULLIF(v_entry->>'styleScore','')::DECIMAL,
      NULL,
      COALESCE((v_entry->>'needsReview')::BOOLEAN, FALSE),
      v_entry->>'reviewReason'
    ) ON CONFLICT (order_id, pose_number) DO UPDATE SET
      status = EXCLUDED.status,
      original_image_url = EXCLUDED.original_image_url,
      quality_score = EXCLUDED.quality_score,
      consistency_score = EXCLUDED.consistency_score,
      needs_manual_review = EXCLUDED.needs_manual_review,
      manual_review_reason = EXCLUDED.manual_review_reason,
      updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upsert_from_manifest_2a IS 'Upserts character generation data from Workflow 2A manifest';

-- ========================================
-- Task 6: Create RPC Function - Upsert from 2B Manifest
-- ========================================

CREATE OR REPLACE FUNCTION upsert_from_manifest_2b(p_order_id TEXT, p_manifest JSONB)
RETURNS VOID AS $$
DECLARE
  v_orders_id INTEGER;
  v_entry JSONB;
  v_pose INT;
BEGIN
  -- Find the order by id (primary key is 'id' in our actual schema)
  SELECT id INTO v_orders_id FROM orders 
  WHERE id = p_order_id::INTEGER
  LIMIT 1;
  
  IF v_orders_id IS NULL THEN 
    RAISE EXCEPTION 'Order not found for %', p_order_id; 
  END IF;

  -- Update the orders table with manifest 2B data
  UPDATE orders SET
    manifest_2b_url = COALESCE(p_manifest->'manifests'->>'2b', manifest_2b_url),
    status = '2b_review',
    workflow_step = 'bria_processing',
    next_workflow = '3-compile-book',
    updated_at = NOW()
  WHERE id = v_orders_id;

  -- Loop through entries and update character_generations
  FOR v_entry IN SELECT jsonb_array_elements(p_manifest->'entries') LOOP
    v_pose := (v_entry->>'poseNumber')::INT;
    
    UPDATE character_generations SET
      background_removed_url = v_entry->>'bgRemovedImageUrl',
      bria_request_id = v_entry->>'briaRequestId',
      bria_status = v_entry->>'briaStatus',
      status = COALESCE(v_entry->>'status','processed'),
      needs_manual_review = COALESCE((v_entry->>'needsReview')::BOOLEAN, FALSE),
      manual_review_reason = COALESCE(v_entry->>'reviewReason', manual_review_reason),
      updated_at = NOW()
    WHERE order_id = v_orders_id AND pose_number = v_pose;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upsert_from_manifest_2b IS 'Upserts background removal data from Workflow 2B manifest';

-- ========================================
-- Task 7: Create Dashboard View for Orders Review
-- ========================================

-- Simplified view using actual column names
CREATE OR REPLACE VIEW v_orders_review AS
SELECT 
  id as order_id,
  id,
  amazon_order_id,
  status,
  workflow_step,
  next_workflow,
  (SELECT review_type FROM human_review_queue WHERE order_id = orders.id ORDER BY created_at DESC LIMIT 1) as review_type,
  (SELECT status FROM human_review_queue WHERE order_id = orders.id ORDER BY created_at DESC LIMIT 1) as review_status,
  (SELECT review_priority FROM human_review_queue WHERE order_id = orders.id ORDER BY created_at DESC LIMIT 1) as review_priority,
  (SELECT reviewed_by FROM human_review_queue WHERE order_id = orders.id ORDER BY created_at DESC LIMIT 1) as reviewed_by
FROM orders;

COMMENT ON VIEW v_orders_review IS 'View for dashboard showing orders and their review status';

-- ========================================
-- Task 8: Add missing columns to orders table (for workflow integration)
-- ========================================

-- Add columns that might be needed but not in original schema
ALTER TABLE orders ADD COLUMN IF NOT EXISTS character_hash VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS workflow_step VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_workflow VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS human_approved BOOLEAN;

-- Add helpful comments
COMMENT ON COLUMN orders.character_hash IS 'Deterministic hash of character specifications for caching';
COMMENT ON COLUMN orders.workflow_step IS 'Current workflow step (ai_generation, bria_processing, book_assembly, etc.)';
COMMENT ON COLUMN orders.next_workflow IS 'Next workflow to process this order';
COMMENT ON COLUMN orders.human_approved IS 'Whether human reviewer has approved this order';

-- ========================================
-- Verification Queries
-- ========================================

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('manifest_2a_url', 'manifest_2b_url', 'manifest_3_url', 'character_hash', 'workflow_step', 'next_workflow', 'human_approved');

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('character_generations', 'human_review_queue');

-- Verify RPC functions were created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('upsert_from_manifest_2a', 'upsert_from_manifest_2b');

-- Verify indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('orders', 'character_generations', 'human_review_queue');

