-- Verification queries for preview system migration
-- Run these in Supabase SQL Editor to verify migration was successful

-- 1. Check if revision_count column was added to orders table
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders' 
  AND column_name = 'revision_count';

-- 2. Check if preview_tokens table exists
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'preview_tokens';

-- 3. Check preview_tokens table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'preview_tokens'
ORDER BY ordinal_position;

-- 4. Check if preview_tokens indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'preview_tokens';

-- 5. Check if customer_feedback table exists
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'customer_feedback';

-- 6. Check customer_feedback table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customer_feedback'
ORDER BY ordinal_position;

-- 7. Check if customer_feedback indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'customer_feedback';

-- 8. Check if notification_logs table exists
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'notification_logs';

-- 9. Check notification_logs table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'notification_logs'
ORDER BY ordinal_position;

-- 10. Check if notification_logs indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'notification_logs';

-- 11. Summary: List all tables that should exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('preview_tokens', 'customer_feedback', 'notification_logs')
ORDER BY table_name;

