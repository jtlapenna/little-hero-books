# Why Orders Can't Be Deleted from Supabase

## The Problem

You've deleted orders from R2 (and their manifests), but they still exist in Supabase and can't be deleted. This is a **data consistency issue** between R2 and Supabase.

## Root Causes

### 1. **R2 and Supabase Are Separate Systems**
- **R2** = File storage (manifests, images, PDFs)
- **Supabase** = Database (order records, metadata)
- Deleting from R2 **does NOT** automatically delete from Supabase
- They are **not synchronized** - you must delete from both separately

### 2. **Foreign Key Constraints**
The `orders` table has several related tables with foreign keys:
- `character_generations` → `order_id` (ON DELETE CASCADE)
- `failed_orders` → `order_id` (ON DELETE CASCADE)
- `audit_logs` → `order_id` (ON DELETE CASCADE)
- `human_review_queue` → `order_id` (ON DELETE CASCADE)
- `workflow_execution_logs` → `order_id` (ON DELETE CASCADE)

**Note:** All have `ON DELETE CASCADE`, so they should delete automatically. If deletion is failing, it's likely due to:

### 3. **Row Level Security (RLS) Policies**
Supabase uses RLS to control access. If RLS policies don't allow DELETE operations, you can't delete orders even if you have the right SQL permissions.

### 4. **Supabase UI Restrictions**
The Supabase dashboard UI might have restrictions on DELETE operations for safety. You may need to use SQL directly.

### 5. **Transaction Failures**
If a deletion transaction fails partway through (e.g., constraint violation), the entire operation rolls back, leaving the order intact.

## Solutions

### Immediate Fix: Delete via SQL

Run the diagnostic query first:
```sql
-- See what's preventing deletion
-- Run: docs/database/diagnose-order-deletion-issues.sql
```

Then use the safe deletion script:
```sql
-- Delete specific order
DELETE FROM orders WHERE amazon_order_id = 'ORDER-ID-HERE';
```

### Long-term Fix: Synchronized Deletion

1. **Create a deletion API endpoint** that:
   - Deletes from R2 first
   - Then deletes from Supabase
   - Handles errors gracefully

2. **Add a cleanup job** that:
   - Finds orders with missing manifests in R2
   - Marks them as "orphaned" or deletes them
   - Runs periodically

3. **Add soft-delete pattern**:
   - Add `deleted_at` column to orders
   - Mark orders as deleted instead of hard-deleting
   - Clean up later via background job

## Why This Happens

**R2 deletion ≠ Supabase deletion** because:
- They're different services (Cloudflare R2 vs Supabase PostgreSQL)
- No automatic sync between them
- Manual deletion from R2 UI doesn't trigger Supabase deletion
- Workflows might delete from R2 but not update Supabase

## Prevention

1. **Always delete from both systems** when cleaning up test data
2. **Use API endpoints** that handle both R2 and Supabase deletion
3. **Add validation** to check if manifests exist before processing orders
4. **Create cleanup workflows** that detect orphaned records

## Files Created

- `docs/database/diagnose-order-deletion-issues.sql` - Diagnostic queries
- `docs/database/safe-delete-orders.sql` - Safe deletion scripts
- This document - Explanation of the issue

