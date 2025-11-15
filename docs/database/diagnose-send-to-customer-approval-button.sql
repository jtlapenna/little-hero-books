-- Diagnostic SQL script to determine why "Send for Customer Approval" button is not enabled
-- For order: E2E-003
-- 
-- Requirements for button to be enabled:
-- 1. PreBria stage must be approved
-- 2. PostBria stage must be approved
-- 3. Compiled PDF must not be flagged
-- 4. No pages must be flagged
-- 5. Compiled PDF must exist (or dev mode/environment exception)

SELECT 
  o.id,
  o.amazon_order_id,
  o.execution_status,
  o.workflow_step,
  o.manifest_3_url,
  
  -- Check review stages
  o.review_stages->>'preBria' as pre_bria_stage,
  o.review_stages->'preBria'->>'status' as pre_bria_status,
  o.review_stages->>'postBria' as post_bria_stage,
  o.review_stages->'postBria'->>'status' as post_bria_status,
  o.review_stages->>'postPdf' as post_pdf_stage,
  o.review_stages->'postPdf'->>'status' as post_pdf_status,
  
  -- Check flags (from Supabase flags column)
  o.flags->>'postPdf' as post_pdf_flags,
  o.has_flags,
  
  -- Check if PDF exists (manifest_3_url indicates workflow 3 completed)
  CASE 
    WHEN o.manifest_3_url IS NOT NULL THEN 'PDF exists (manifest_3_url present)'
    WHEN o.workflow_step = 'book_assembly_completed' THEN 'PDF exists (workflow_step indicates completion)'
    WHEN o.workflow_step = '3-complete' THEN 'PDF exists (workflow_step indicates completion)'
    ELSE 'PDF may not exist'
  END as pdf_status,
  
  -- Diagnostic: Check each requirement
  CASE 
    WHEN o.review_stages->'preBria'->>'status' = 'approved' THEN '✅ PreBria approved'
    ELSE '❌ PreBria NOT approved'
  END as requirement_1_prebria,
  
  CASE 
    WHEN o.review_stages->'postBria'->>'status' = 'approved' THEN '✅ PostBria approved'
    ELSE '❌ PostBria NOT approved'
  END as requirement_2_postbria,
  
  CASE 
    WHEN o.flags->>'postPdf' IS NULL OR (o.flags->>'postPdf')::jsonb = '{}'::jsonb THEN '✅ No PDF flags'
    ELSE '❌ PDF has flags: ' || (o.flags->>'postPdf')::text
  END as requirement_3_pdf_flags,
  
  CASE 
    WHEN o.flags->'postPdf'->>'pages' IS NULL OR (o.flags->'postPdf'->>'pages')::jsonb = '[]'::jsonb THEN '✅ No page flags'
    ELSE '❌ Pages have flags: ' || (o.flags->'postPdf'->>'pages')::text
  END as requirement_4_page_flags,
  
  CASE 
    WHEN o.manifest_3_url IS NOT NULL THEN '✅ PDF exists (manifest_3_url)'
    WHEN o.workflow_step IN ('book_assembly_completed', '3-complete') THEN '✅ PDF exists (workflow_step)'
    ELSE '❌ PDF may not exist (check manifest_3_url and workflow_step)'
  END as requirement_5_pdf_exists,
  
  -- Overall status
  CASE 
    WHEN o.review_stages->'preBria'->>'status' = 'approved'
     AND o.review_stages->'postBria'->>'status' = 'approved'
     AND (o.flags->>'postPdf' IS NULL OR (o.flags->>'postPdf')::jsonb = '{}'::jsonb)
     AND (o.manifest_3_url IS NOT NULL OR o.workflow_step IN ('book_assembly_completed', '3-complete'))
    THEN '✅ Button SHOULD be enabled'
    ELSE '❌ Button is DISABLED - see requirements above'
  END as button_status

FROM orders o
WHERE o.amazon_order_id = 'E2E-003'
LIMIT 1;

-- Additional query: Check for any flags in the flags column
SELECT 
  o.amazon_order_id,
  o.flags,
  o.has_flags,
  o.flags->>'preBria' as pre_bria_flags,
  o.flags->>'postBria' as post_bria_flags,
  o.flags->>'postPdf' as post_pdf_flags,
  jsonb_array_length(COALESCE(o.flags->'postPdf'->'pages', '[]'::jsonb)) as flagged_pages_count
FROM orders o
WHERE o.amazon_order_id = 'E2E-003'
LIMIT 1;

-- Query to check manifest 3 status (if available)
SELECT 
  o.amazon_order_id,
  o.manifest_3_url,
  o.workflow_step,
  o.execution_status,
  o.current_workflow,
  o.started_at,
  o.updated_at
FROM orders o
WHERE o.amazon_order_id = 'E2E-003'
LIMIT 1;

