-- Run this in Supabase SQL editor before migration-d2c-phase-0-orders.sql
-- Paste or share the results so we can confirm existing columns and adjust the migration if needed.

-- 1. All columns on orders (name, type, nullable, default)
SELECT
  column_name,
  data_type,
  character_maximum_length,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- 2. Primary key and unique constraints on orders
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' AND tc.table_name = 'orders'
ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position;
