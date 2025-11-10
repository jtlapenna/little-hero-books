# Database Migration: Add W0/W1.1 Support Fields

**Date:** 2025-01-09  
**Purpose:** Add required fields for Workflow 0 (Order Intake) and Workflow 1.1 (Router)  
**Target:** Supabase PostgreSQL database  
**Status:** Ready to execute

---

## Overview

This migration adds the following fields to the `orders` table to support W0 and W1.1 workflows:

- `execution_status` - Tracks order processing state (`ready_for_processing`, `processing`, `done`, `error`)
- `started_at` - Timestamp when order processing began
- `current_workflow` - Currently executing workflow (e.g., `2A`, `2B`, `3`)
- `one_manifest_url` - URL to 1-manifest.json (from Workflow 0)
- `dedication_text` - Dedication text extracted from order for easier access

---

## Safety

✅ **Safe to run on existing database** - Uses `IF NOT EXISTS` clauses  
✅ **Non-destructive** - Only adds new columns, doesn't modify existing data  
✅ **Idempotent** - Can be run multiple times safely

---

## Migration SQL

Execute this SQL in your Supabase SQL Editor:

```sql
-- =============================================
-- Add W0/W1.1 Support Fields to Orders Table
-- =============================================

-- Add execution_status column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'ready_for_processing';

-- Add started_at column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- Add current_workflow column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_workflow VARCHAR(50);

-- Add one_manifest_url column (for 1-manifest from W0)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS one_manifest_url TEXT;

-- Add dedication_text column (extracted from character_specs for easier access)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dedication_text TEXT;

-- =============================================
-- Add Indexes for Performance
-- =============================================

-- Index for execution_status queries (optimized for W1.1 router)
CREATE INDEX IF NOT EXISTS idx_orders_execution_status_priority_queued 
  ON orders(execution_status, priority DESC NULLS LAST, queued_at ASC);

-- Partial index for ready_for_processing (faster queries for router)
CREATE INDEX IF NOT EXISTS idx_orders_ready_for_processing 
  ON orders(priority DESC NULLS LAST, queued_at ASC) 
  WHERE execution_status = 'ready_for_processing';

-- =============================================
-- Add Column Comments
-- =============================================

COMMENT ON COLUMN orders.execution_status IS 'Order execution status: ready_for_processing, processing, done, error';
COMMENT ON COLUMN orders.started_at IS 'Timestamp when order started processing (set when execution_status changes to processing)';
COMMENT ON COLUMN orders.current_workflow IS 'Currently executing workflow (2A, 2B, 3, etc.)';
COMMENT ON COLUMN orders.one_manifest_url IS 'URL to 1-manifest.json (from Workflow 0)';
COMMENT ON COLUMN orders.dedication_text IS 'Dedication text from order (extracted from character_specs for easier access)';
```

---

## Execution Steps

1. **Open Supabase Dashboard**
   - Navigate to your project: `https://mdnthwpcnphjnnblbvxk.supabase.co`
   - Go to **SQL Editor**

2. **Create New Query**
   - Click **New Query**
   - Paste the migration SQL above

3. **Review the SQL**
   - Verify all `IF NOT EXISTS` clauses are present
   - Confirm table name is `orders` (not `little_hero_books.orders`)

4. **Execute**
   - Click **Run** or press `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
   - Wait for "Success" confirmation

5. **Verify**
   - Run this verification query:
   ```sql
   SELECT 
     column_name, 
     data_type, 
     column_default,
     is_nullable
   FROM information_schema.columns 
   WHERE table_name = 'orders' 
     AND column_name IN (
       'execution_status', 
       'started_at', 
       'current_workflow', 
       'one_manifest_url', 
       'dedication_text'
     )
   ORDER BY column_name;
   ```
   
   Expected output: 5 rows with the new columns

6. **Verify Indexes**
   - Run this query:
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE tablename = 'orders'
     AND indexname IN (
       'idx_orders_execution_status_priority_queued',
       'idx_orders_ready_for_processing'
     );
   ```
   
   Expected output: 2 rows with the new indexes

---

## Expected Results

### New Columns Added

| Column Name | Type | Default | Nullable | Purpose |
|------------|------|---------|----------|---------|
| `execution_status` | VARCHAR(50) | `'ready_for_processing'` | Yes | Order processing state |
| `started_at` | TIMESTAMP | NULL | Yes | When processing started |
| `current_workflow` | VARCHAR(50) | NULL | Yes | Active workflow name |
| `one_manifest_url` | TEXT | NULL | Yes | URL to 1-manifest.json |
| `dedication_text` | TEXT | NULL | Yes | Dedication text |

### New Indexes Added

1. **`idx_orders_execution_status_priority_queued`**
   - Composite index on `(execution_status, priority DESC, queued_at ASC)`
   - Optimizes W1.1 router queries for fetching ready orders

2. **`idx_orders_ready_for_processing`**
   - Partial index on `(priority DESC, queued_at ASC)`
   - Only indexes rows where `execution_status = 'ready_for_processing'`
   - Faster queries for router's most common operation

---

## Data Migration Notes

### Existing Rows

- **`execution_status`**: All existing rows will default to `'ready_for_processing'`
- **`started_at`**: Will be `NULL` for existing rows (set when processing begins)
- **`current_workflow`**: Will be `NULL` for existing rows (set by W1.1 router)
- **`one_manifest_url`**: Will be `NULL` for existing rows (set by W0)
- **`dedication_text`**: Will be `NULL` for existing rows (can be populated from `character_specs->>'dedication'` if needed)

### Optional: Populate Dedication Text

If you want to extract `dedication_text` from existing `character_specs` JSONB:

```sql
-- Optional: Extract dedication from character_specs for existing rows
UPDATE orders 
SET dedication_text = character_specs->>'dedication'
WHERE dedication_text IS NULL 
  AND character_specs->>'dedication' IS NOT NULL
  AND character_specs->>'dedication' != '';
```

---

## Rollback (If Needed)

If you need to remove these columns (not recommended after W0/W1.1 go live):

```sql
-- WARNING: Only run if you need to rollback
-- This will delete data in these columns

DROP INDEX IF EXISTS idx_orders_ready_for_processing;
DROP INDEX IF EXISTS idx_orders_execution_status_priority_queued;

ALTER TABLE orders DROP COLUMN IF EXISTS dedication_text;
ALTER TABLE orders DROP COLUMN IF EXISTS one_manifest_url;
ALTER TABLE orders DROP COLUMN IF EXISTS current_workflow;
ALTER TABLE orders DROP COLUMN IF EXISTS started_at;
ALTER TABLE orders DROP COLUMN IF EXISTS execution_status;
```

---

## Testing

After migration, test with a sample query:

```sql
-- Test: Fetch ready orders (what W1.1 router will do)
SELECT 
  id,
  amazon_order_id,
  execution_status,
  priority,
  queued_at,
  next_workflow
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY priority DESC NULLS LAST, queued_at ASC
LIMIT 10;
```

---

## Questions or Issues?

If you encounter any errors:
1. Check that you're connected to the correct database
2. Verify the `orders` table exists
3. Ensure you have sufficient permissions (service role key)
4. Check Supabase logs for detailed error messages

---

**Migration prepared by:** AI Assistant  
**Reviewed by:** [Your name]  
**Approved for execution:** [Date]

