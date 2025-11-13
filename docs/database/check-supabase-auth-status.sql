-- Check your current authentication status in Supabase
-- This helps determine if RLS is blocking you

-- Check current user/role
SELECT 
  current_user as database_user,
  current_role as current_role,
  session_user as session_user;

-- Check if you have DELETE permission on orders table
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND privilege_type = 'DELETE';

-- If you're using Supabase UI, you might be authenticated as 'authenticated' role
-- If you're using SQL Editor directly, you might be 'postgres' or 'service_role'

