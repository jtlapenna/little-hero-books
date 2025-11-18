-- Check if Workflow 4 is storing lulu_job_id
-- Run this in Supabase SQL Editor

-- Query 1: Check if lulu_job_id column exists (already confirmed - it exists!)
-- Result: lulu_job_id (VARCHAR) and lulu_status (VARCHAR) both exist

-- Query 2: Check for orders with Lulu job IDs stored
-- (This will show if Workflow 4 has been storing them)
SELECT 
  "orderId",
  "amazonOrderId",
  "lulu_job_id",
  "lulu_status",
  "status",
  "updated_at"
FROM orders
WHERE "lulu_job_id" IS NOT NULL
ORDER BY "updated_at" DESC
LIMIT 10;

-- Query 3: Check all Lulu-related columns
SELECT 
  column_name, 
  data_type
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND (
    column_name LIKE '%lulu%' OR
    column_name LIKE '%Lulu%' OR
    column_name LIKE '%pod%' OR
    column_name LIKE '%Pod%'
  )
ORDER BY column_name;

