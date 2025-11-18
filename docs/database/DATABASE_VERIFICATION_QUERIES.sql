-- ========================================
-- DATABASE VERIFICATION QUERIES
-- Run these in Supabase SQL Editor and share results
-- ========================================

-- Query 1: Check ALL columns in orders table
-- This will show us what fields actually exist
SELECT 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- Query 2: Check for specific fields mentioned in Developer Packages
-- Fields that documents claim exist
SELECT 
  column_name, 
  data_type,
  CASE 
    WHEN column_name IN (
      'review_stages', 'flags', 'has_flags',
      'customer_approval_status', 'customer_approval_required',
      'customer_approval_requested_at', 'customer_approval_approved_at',
      'workflow_step', 'next_workflow', 'execution_status',
      'lulu_job_id', 'lulu_status', 'luluJobId', 'luluStatus',
      'character_hash', 'human_approved',
      'manifest_2a_url', 'manifest_2b_url', 'manifest_3_url',
      'delivered_at', 'revision_count'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN (
    'review_stages', 'flags', 'has_flags',
    'customer_approval_status', 'customer_approval_required',
    'customer_approval_requested_at', 'customer_approval_approved_at',
    'workflow_step', 'next_workflow', 'execution_status',
    'lulu_job_id', 'lulu_status', 'luluJobId', 'luluStatus',
    'character_hash', 'human_approved',
    'manifest_2a_url', 'manifest_2b_url', 'manifest_3_url',
    'delivered_at', 'revision_count',
    'status', 'podOrderId', 'trackingNumber', 'carrier', 'trackingUrl'
  )
ORDER BY column_name;

-- Query 3: Check if supporting tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'preview_tokens', 'customer_feedback', 'notification_logs',
      'character_generations', 'human_review_queue', 'customer_contacts'
    ) THEN 'EXISTS'
    ELSE 'UNEXPECTED'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'orders', 'failed_orders', 'order_processing_log', 'system_config',
    'preview_tokens', 'customer_feedback', 'notification_logs',
    'character_generations', 'human_review_queue', 'customer_contacts'
  )
ORDER BY table_name;

-- Query 4: Check for RPC functions (for Developer A workflows)
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'upsert_from_manifest_2a',
    'upsert_from_manifest_2b'
  )
ORDER BY routine_name;

-- Query 5: Check indexes on orders table
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'orders'
ORDER BY indexname;

-- Query 6: Sample data check - see what fields are actually being used
-- (Only run if you have test data)
SELECT 
  orderId,
  status,
  workflow_step,
  lulu_job_id,
  lulu_status,
  luluJobId,
  luluStatus,
  podOrderId,
  customer_approval_status,
  has_flags,
  character_hash,
  human_approved
FROM orders
LIMIT 5;

-- Query 7: Check for camelCase vs snake_case variations
-- (Some code might use camelCase, some snake_case)
SELECT 
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND (
    column_name LIKE '%lulu%' OR
    column_name LIKE '%Lulu%' OR
    column_name LIKE '%workflow%' OR
    column_name LIKE '%Workflow%' OR
    column_name LIKE '%approval%' OR
    column_name LIKE '%Approval%'
  )
ORDER BY column_name;

