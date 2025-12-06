# Orders Deleted from Supabase - Recovery Guide

## Critical Issue

Orders have been **completely deleted from Supabase** but still exist in R2 storage with their manifests. This is why:
- Backend shows "Missing Manifest" (checks Supabase fields, not R2)
- Orders still appear in UI (backend falls back to R2 when Supabase is empty)
- But status detection fails (relies on Supabase data)

## Why Orders Still Appear

The backend has a **fallback mechanism**:

```typescript
// From back-end/src/app/api/orders/route.ts
// 1. Try Supabase first
const supabaseRecords = await listOrdersFromSupabase();

if (supabaseRecords.length > 0) {
  // Use Supabase orders
} else {
  // 2. Fallback to R2 manifests
  const fallback = await buildOrdersFromR2();
  return fallback.orders;
}
```

So orders **do appear** in the UI because they're loaded from R2, but:
- They show "Missing Manifest" because Supabase fields are NULL
- Status detection fails
- Workflows may not work correctly

## Why Orders Were Deleted

Possible causes (in order of likelihood):

### 1. **Manual Deletion via Supabase Dashboard** ⚠️ MOST LIKELY
- Someone deleted orders manually
- Check Supabase Dashboard → Logs for DELETE operations
- Check who has access to Supabase dashboard

### 2. **Database Reset/Migration**
- Database was reset or migrated
- Check Supabase Dashboard → Database → Migrations
- Look for recent schema changes

### 3. **RLS Policy Changes**
- Row Level Security policies changed
- Orders are hidden, not deleted
- Check Supabase Dashboard → Authentication → Policies

### 4. **Cascade Delete**
- Related table had cascade delete
- Unlikely - orders table is usually the parent

### 5. **Script/Workflow Deletion**
- A cleanup script ran
- Check for any cleanup scripts in codebase
- Check workflow execution logs

### 6. **Supabase Project Reset**
- Project was reset or recreated
- Check Supabase Dashboard → Settings → General

## Immediate Recovery Steps

### Step 1: Verify Orders Are Actually Deleted

```bash
# Check Supabase directly
# Go to Supabase Dashboard → Table Editor → orders
# See if any orders exist
```

Or use the diagnostic script:
```bash
node scripts/diagnose-missing-manifests.js
```

### Step 2: Check Supabase Logs

1. Go to Supabase Dashboard → Logs
2. Filter for DELETE operations on `orders` table
3. Check timestamp when orders disappeared
4. See who/what performed the deletion

### Step 3: Recover Orders from R2

**Option A: Recover All Orders (Recommended)**

```bash
# Dry run first (see what would be recovered)
node scripts/recover-orders-from-r2.js --dry-run

# Actually recover all orders
node scripts/recover-orders-from-r2.js
```

This will:
1. Scan R2 for all order manifests
2. Extract order data from manifests
3. Recreate orders in Supabase
4. Set manifest URLs correctly
5. Fix "Missing Manifest" status

**Option B: Recover Specific Order**

```bash
node scripts/recover-orders-from-r2.js JESSICA-CUNT
```

### Step 4: Verify Recovery

```bash
# Check if orders are back in Supabase
node scripts/diagnose-missing-manifests.js

# Or check via API
curl https://admin.littleherolabs.com/api/orders | jq 'length'
```

### Step 5: Update Manifest URLs (If Needed)

If orders were recovered but manifest URLs are still missing:

```bash
node scripts/recover-manifest-urls.js
```

## Prevention

### 1. **Enable Supabase Backups**
- Go to Supabase Dashboard → Database → Backups
- Enable Point-in-Time Recovery (PITR)
- Set up daily backups

### 2. **Restrict Supabase Access**
- Review who has access to Supabase dashboard
- Use service role keys only in backend
- Don't give dashboard access to everyone

### 3. **Add Soft Delete**
- Add `deleted_at` column to orders
- Mark as deleted instead of hard-deleting
- Only hard-delete after retention period

### 4. **Add Audit Logging**
- Log all DELETE operations
- Track who deleted what and when
- Alert on bulk deletions

### 5. **Add RLS Policies**
- Prevent accidental deletions
- Require explicit permissions
- Add confirmation for bulk operations

## Emergency Recovery Checklist

- [ ] Check Supabase Dashboard → Logs for DELETE operations
- [ ] Verify orders are actually deleted (not just hidden by RLS)
- [ ] Check Supabase backups (if available)
- [ ] Run `recover-orders-from-r2.js` to recreate orders
- [ ] Run `recover-manifest-urls.js` to set manifest URLs
- [ ] Verify orders appear correctly in backend
- [ ] Check "Missing Manifest" status is resolved
- [ ] Review who has Supabase access
- [ ] Set up backups if not already enabled
- [ ] Document what happened and why

## Why This Is Critical

Without Supabase records:
- ✅ Orders appear in UI (loaded from R2 fallback)
- ❌ Status detection fails (checks Supabase)
- ❌ Workflows may not work (rely on Supabase data)
- ❌ Order tracking is broken
- ❌ Customer data may be lost

## Recovery Script Details

The `recover-orders-from-r2.js` script:

1. **Scans R2** for all manifests
2. **Extracts order data** from manifests (2b > 2a > 3 > 1 priority)
3. **Checks Supabase** to avoid duplicates
4. **Creates orders** in Supabase with:
   - Order ID and Amazon Order ID
   - Customer email/name
   - Character hash and specs
   - Book specs and order details
   - Manifest URLs (one_manifest_url, manifest_2a_url, etc.)
   - Execution status and next_workflow
5. **Skips** orders that already exist

## Next Steps After Recovery

1. **Investigate Root Cause**
   - Check Supabase logs
   - Review access logs
   - Identify what/who deleted orders

2. **Prevent Recurrence**
   - Set up backups
   - Restrict access
   - Add soft delete
   - Add audit logging

3. **Monitor**
   - Set up alerts for order count drops
   - Monitor Supabase DELETE operations
   - Track order creation/deletion rates

