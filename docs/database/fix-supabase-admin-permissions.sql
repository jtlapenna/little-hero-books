-- Fix Supabase Admin Permissions
-- Run this in Supabase SQL Editor to allow administrators to view tables
-- This grants permissions to authenticated users (which includes admins)

-- 1. Grant schema usage
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- 2. Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 3. Grant sequence permissions (for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 4. Grant view permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 5. Create RLS policies for authenticated users (admins) to view all orders
-- First, check if RLS is enabled and create policies if needed

-- Policy for orders table - allow authenticated users to view all
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS "Authenticated users can view orders" ON orders;
    
    -- Create new policy
    CREATE POLICY "Authenticated users can view orders" ON orders
    FOR SELECT
    TO authenticated
    USING (true);
    
    -- Also allow authenticated users to modify orders
    DROP POLICY IF EXISTS "Authenticated users can modify orders" ON orders;
    CREATE POLICY "Authenticated users can modify orders" ON orders
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 6. Do the same for other tables if they exist
DO $$
BEGIN
  -- character_generations
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'character_generations') THEN
    DROP POLICY IF EXISTS "Authenticated users can view character_generations" ON character_generations;
    CREATE POLICY "Authenticated users can view character_generations" ON character_generations
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
  
  -- failed_orders
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'failed_orders') THEN
    DROP POLICY IF EXISTS "Authenticated users can view failed_orders" ON failed_orders;
    CREATE POLICY "Authenticated users can view failed_orders" ON failed_orders
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
  
  -- audit_logs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    DROP POLICY IF EXISTS "Authenticated users can view audit_logs" ON audit_logs;
    CREATE POLICY "Authenticated users can view audit_logs" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
  
  -- human_review_queue
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'human_review_queue') THEN
    DROP POLICY IF EXISTS "Authenticated users can view human_review_queue" ON human_review_queue;
    CREATE POLICY "Authenticated users can view human_review_queue" ON human_review_queue
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
  
  -- workflow_execution_logs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workflow_execution_logs') THEN
    DROP POLICY IF EXISTS "Authenticated users can view workflow_execution_logs" ON workflow_execution_logs;
    CREATE POLICY "Authenticated users can view workflow_execution_logs" ON workflow_execution_logs
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

-- 7. Grant permissions on views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 8. Verify permissions
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'character_generations', 'failed_orders', 'audit_logs', 'human_review_queue', 'workflow_execution_logs')
ORDER BY tablename;

-- 9. Check RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'character_generations', 'failed_orders', 'audit_logs', 'human_review_queue', 'workflow_execution_logs')
ORDER BY tablename;

