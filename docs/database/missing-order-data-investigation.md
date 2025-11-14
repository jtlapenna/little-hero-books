# Missing Order Data Investigation

## Issue
Two orders that have been moving through W1.2, W1.3, and W1.4 recovery workflows are showing `null` for `character_specs` and `product_info` in Supabase, despite being test orders that should have been submitted with this information.

## Investigation

### 1. Workflow Data Preservation Check

**W1.2 - Stuck Workflow Manager:**
- Only updates: `execution_status`, `error_type`, `error_message`, `last_error_at`
- Does NOT touch `character_specs` or `product_info`
- ✅ **Safe** - preserves data

**W1.3 - Retry Recovery Manager:**
- Only updates: `execution_status`, `error_message`, `error_type`, `next_retry_at`, `current_workflow`, `started_at`
- Does NOT touch `character_specs` or `product_info`
- ✅ **Safe** - preserves data

**W1.4 - Orphaned Orders Monitor:**
- Only updates: `execution_status`, `error_message`, `retry_count`, `next_retry_at`, `current_workflow`, `started_at`
- Does NOT touch `character_specs` or `product_info`
- ✅ **Safe** - preserves data

**Conclusion:** The recovery workflows are NOT overwriting `character_specs` or `product_info`. They use PATCH requests with only specific fields, so they preserve existing data.

### 2. Possible Root Causes

1. **Orders were created without data initially**
   - Check `created_at` vs `updated_at` timestamps
   - If `character_specs` was null from the start, it was never set
   - Run diagnostic query: `docs/database/diagnose-missing-order-data.sql`

2. **W0 (Order Intake) failed to set data**
   - W0 should populate `character_specs` and `product_info` from the manifest
   - If W0's upsert failed or was incomplete, data might be missing
   - Check W0 execution logs for these orders

3. **Data was cleared by another process**
   - Check Supabase audit logs (if available)
   - Check for any other workflows or API endpoints that update orders
   - Check if there were any manual database updates

4. **Data exists in manifest but not in database**
   - Check R2 for `1-manifest.json` files
   - Compare manifest data with database records
   - If manifest has data but database doesn't, W0 might have failed

### 3. Diagnostic Queries

Run `docs/database/diagnose-missing-order-data.sql` to:
- Check if data was ever set
- Compare `created_at` vs `updated_at` timestamps
- Check if other orders have the same issue (pattern detection)
- Verify manifest URLs exist

### 4. Recovery Options

If data is missing but exists in manifests:
1. Re-run W0 for these orders (if possible)
2. Manually update Supabase from manifest data
3. Create a recovery script to sync manifest → database

If data is completely missing:
1. Check if test orders were created correctly
2. Verify W0 is working properly
3. Check if there's a data validation issue preventing saves

## Next Steps

1. Run diagnostic query on the affected orders
2. Check W0 execution logs for these orders
3. Check if manifests exist in R2 with the data
4. If data exists in manifests, create recovery script
5. If data doesn't exist anywhere, investigate W0/order creation process

