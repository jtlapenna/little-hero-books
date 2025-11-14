-- Check full RLS policy details including with_check clause
-- The with_check clause can block INSERT/UPDATE/DELETE even if qual allows it

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'orders';

-- Also check if RLS is actually enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'orders';

