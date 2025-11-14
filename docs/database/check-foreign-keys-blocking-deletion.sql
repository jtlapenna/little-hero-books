-- Check for foreign key constraints that might prevent order deletion
-- Run this to see what tables reference orders

SELECT
  tc.constraint_name,
  tc.table_name as referencing_table,
  kcu.column_name as referencing_column,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  rc.delete_rule,
  CASE 
    WHEN rc.delete_rule = 'CASCADE' THEN '✅ Will auto-delete'
    WHEN rc.delete_rule = 'RESTRICT' THEN '❌ BLOCKS deletion'
    WHEN rc.delete_rule = 'NO ACTION' THEN '❌ BLOCKS deletion'
    WHEN rc.delete_rule = 'SET NULL' THEN '⚠️ Sets to NULL'
    WHEN rc.delete_rule = 'SET DEFAULT' THEN '⚠️ Sets to default'
    ELSE '❓ Unknown'
  END as deletion_behavior
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'orders'
ORDER BY tc.table_name, tc.constraint_name;

-- If any show 'RESTRICT' or 'NO ACTION', those will block deletion
-- If all show 'CASCADE', deletion should work

