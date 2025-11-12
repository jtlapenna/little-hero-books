-- Test Supabase JSONB Merge Behavior
-- This script tests if resolution=merge-duplicates deep-merges JSONB or replaces it

-- Step 1: Create a test order with all three review stages
INSERT INTO orders (
  amazon_order_id,
  orderId,
  execution_status,
  status,
  review_stages
) VALUES (
  'TEST-MERGE-001',
  'TEST-MERGE-001',
  'ready_for_processing',
  'new',
  '{
    "preBria": {
      "status": "approved",
      "reviewedAt": "2025-01-12T00:00:00Z",
      "reviewer": "system"
    },
    "postBria": {
      "status": "pending"
    },
    "postPdf": {
      "status": "pending"
    }
  }'::jsonb
)
ON CONFLICT (amazon_order_id) DO NOTHING;

-- Step 2: Simulate what the 2B upsert does - update only postBria
-- This simulates a PATCH with resolution=merge-duplicates
UPDATE orders
SET
  review_stages = jsonb_set(
    COALESCE(review_stages, '{}'::jsonb),
    '{postBria}',
    '{
      "status": "in-review",
      "needsHumanReview": true,
      "posesProcessed": 13,
      "posesSucceeded": 13,
      "posesFailed": 0
    }'::jsonb
  )
WHERE amazon_order_id = 'TEST-MERGE-001';

-- Step 3: Check the result
SELECT
  amazon_order_id,
  review_stages->'preBria' as prebria,
  review_stages->'postBria' as postbria,
  review_stages->'postPdf' as postpdf,
  -- Check if preBria was preserved
  CASE 
    WHEN review_stages->'preBria'->>'status' = 'approved' THEN '✅ preBria PRESERVED'
    ELSE '❌ preBria LOST'
  END as prebria_check,
  -- Check if postPdf was preserved
  CASE 
    WHEN review_stages->'postPdf' IS NOT NULL THEN '✅ postPdf PRESERVED'
    ELSE '❌ postPdf LOST'
  END as postpdf_check
FROM orders
WHERE amazon_order_id = 'TEST-MERGE-001';

-- Step 4: Test with direct JSONB replacement (what happens without merge)
-- First, reset the test order
UPDATE orders
SET
  review_stages = '{
    "preBria": {
      "status": "approved",
      "reviewedAt": "2025-01-12T00:00:00Z",
      "reviewer": "system"
    },
    "postBria": {
      "status": "pending"
    },
    "postPdf": {
      "status": "pending"
    }
  }'::jsonb
WHERE amazon_order_id = 'TEST-MERGE-001';

-- Now test direct replacement (what would happen if merge-duplicates doesn't work)
UPDATE orders
SET
  review_stages = '{
    "postBria": {
      "status": "in-review",
      "needsHumanReview": true,
      "posesProcessed": 13,
      "posesSucceeded": 13,
      "posesFailed": 0
    }
  }'::jsonb
WHERE amazon_order_id = 'TEST-MERGE-001';

-- Check if preBria/postPdf were lost
SELECT
  amazon_order_id,
  review_stages->'preBria' as prebria,
  review_stages->'postBria' as postbria,
  review_stages->'postPdf' as postpdf,
  CASE 
    WHEN review_stages->'preBria' IS NULL THEN '❌ preBria LOST (direct replacement)'
    ELSE '✅ preBria PRESERVED'
  END as result
FROM orders
WHERE amazon_order_id = 'TEST-MERGE-001';

-- Step 5: Cleanup
DELETE FROM orders WHERE amazon_order_id = 'TEST-MERGE-001';

-- Expected Results:
-- If jsonb_set preserves other keys: preBria and postPdf should remain
-- If direct replacement: preBria and postPdf will be NULL
--
-- The key question: Does Supabase REST API with resolution=merge-duplicates
-- use jsonb_set (preserves) or direct replacement (loses)?

