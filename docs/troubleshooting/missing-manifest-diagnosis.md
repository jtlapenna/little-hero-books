# Missing Manifest Issue - Diagnosis & Recovery

## The Problem

Orders show "Missing Manifest" in the backend UI, but when checking R2 storage, the manifests actually exist (1-manifest.json, 2a-manifest.json, 2b-manifest.json, 3-manifest.json).

Additionally, some orders have disappeared from Supabase entirely.

## Root Cause

### Why "Missing Manifest" Shows When Manifests Exist

The backend checks for manifests by looking at **Supabase database fields**, not by checking R2 directly:

```typescript
// From back-end/src/lib/status-display.ts
const hasAnyManifest = !!(
  order.oneManifestUrl ||      // ← Checks Supabase field
  order.manifest2aUrl ||       // ← Checks Supabase field
  order.manifest2bUrl ||       // ← Checks Supabase field
  order.manifest3Url           // ← Checks Supabase field
);

if (!hasAnyManifest) {
  errors.push(DisplayStatus.MISSING_MANIFEST);
}
```

**The Issue:**
- Manifests exist in R2 ✅
- But Supabase `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` fields are NULL ❌
- Backend thinks manifests are missing because it only checks Supabase, not R2

### Why Orders Disappeared from Supabase

Possible causes:

1. **RLS (Row Level Security) Policies**
   - Supabase RLS might be blocking access
   - Check if policies changed or were misconfigured

2. **Database Connection Issues**
   - Temporary connection failures
   - Query timeouts
   - Network issues

3. **Actual Deletion** (Less Likely)
   - Manual deletion via Supabase dashboard
   - Cascade delete from related records
   - Database migration/reset

4. **Query Issues**
   - Field name mismatches (camelCase vs snake_case)
   - Case sensitivity issues
   - Data type mismatches

## Diagnosis Steps

### Step 1: Run Diagnostic Script

```bash
# Diagnose a specific order
node scripts/diagnose-missing-manifests.js JESSICA-CUNT

# Diagnose all orders
node scripts/diagnose-missing-manifests.js
```

This will show:
- Which orders are in Supabase
- Which have manifest URLs stored
- Which have manifests in R2
- The mismatch between them

### Step 2: Check Supabase Directly

1. Go to Supabase Dashboard → Table Editor → `orders`
2. Check if orders exist
3. Look for `manifest_2a_url`, `manifest_2b_url`, `manifest_3_url` fields
4. See if they're NULL even though manifests exist in R2

### Step 3: Check RLS Policies

1. Go to Supabase Dashboard → Authentication → Policies
2. Check `orders` table policies
3. Verify you have access with your current role

### Step 4: Check Supabase Logs

1. Go to Supabase Dashboard → Logs
2. Look for DELETE operations on `orders` table
3. Check for any errors around the time orders disappeared

## Recovery Steps

### Step 1: Recover Manifest URLs

Run the recovery script to sync manifest URLs from R2 to Supabase:

```bash
# Dry run first (see what would be updated)
node scripts/recover-manifest-urls.js --dry-run

# Actually update Supabase
node scripts/recover-manifest-urls.js

# Recover specific order
node scripts/recover-manifest-urls.js JESSICA-CUNT
```

This will:
1. Find orders missing manifest URLs in Supabase
2. Check R2 for existing manifests
3. Update Supabase with correct manifest URLs
4. Fix the "Missing Manifest" status

### Step 2: Recover Missing Orders from R2

If orders are completely missing from Supabase but have manifests in R2:

1. **Option A: Use Order Reset Endpoint**
   ```bash
   # This will recreate order in Supabase from manifest
   curl -X POST https://admin.littleherolabs.com/api/admin/orders/{orderId}/reset
   ```

2. **Option B: Manual Recovery**
   - Read manifest from R2
   - Extract order data
   - Create order in Supabase via API or dashboard

### Step 3: Prevent Future Issues

1. **Ensure Workflows Update Supabase**
   - W0 should set `one_manifest_url` after creating 1-manifest.json
   - W2A should set `manifest_2a_url` after creating 2a-manifest.json
   - W2B should set `manifest_2b_url` after creating 2b-manifest.json
   - W3 should set `manifest_3_url` after creating 3-manifest.json

2. **Add Validation**
   - Check that manifest URLs are set after manifest creation
   - Log warnings if URLs aren't set
   - Add monitoring for this condition

3. **Improve Status Detection**
   - Consider checking R2 directly if Supabase URLs are missing
   - Or update Supabase URLs when loading orders if they're missing

## Quick Fix Commands

```bash
# 1. Diagnose the issue
node scripts/diagnose-missing-manifests.js

# 2. See what would be recovered (dry run)
node scripts/recover-manifest-urls.js --dry-run

# 3. Actually recover manifest URLs
node scripts/recover-manifest-urls.js

# 4. Check if orders are back
curl https://admin.littleherolabs.com/api/orders | jq 'length'
```

## Why This Happened

Most likely scenario:

1. **Workflows created manifests in R2** ✅
2. **But failed to update Supabase with manifest URLs** ❌
   - Network timeout
   - Database connection issue
   - Workflow error that wasn't caught
   - Race condition

3. **Backend checks Supabase, sees NULL URLs** → Shows "Missing Manifest"

4. **Orders may have been filtered out** if RLS policies changed or queries failed

## Prevention

1. **Add retry logic** for Supabase updates
2. **Add validation** that URLs are set after manifest creation
3. **Add monitoring** for orders with NULL manifest URLs
4. **Improve error handling** in workflows to catch update failures
5. **Consider dual-write** - update both R2 and Supabase, or use R2 as source of truth

## Emergency Recovery

If many orders are affected:

1. Run recovery script for all orders
2. Check Supabase RLS policies
3. Review Supabase logs for deletion events
4. Consider restoring from backup if data was actually deleted
5. Contact Supabase support if RLS is blocking access

