# Vercel Cron Jobs Troubleshooting Guide

## Current Configuration

**File Location**: `back-end/vercel.json`
**Cron Jobs**:
1. `/api/cron/router` - Every minute (`* * * * *`)
2. `/api/cron/health-monitor` - Every 10 minutes (`*/10 * * * *`)

## Potential Issues & Solutions

### 1. ⚠️ **CRITICAL: Vercel Plan Limitations**

**Hobby Plan Restrictions**:
- Maximum 2 cron jobs ✅ (You have 2)
- **Each cron job can only run ONCE PER DAY** ❌ (You have one every minute, one every 10 minutes)

**Solution**: 
- If on Hobby plan, you MUST change schedules to run once per day
- Example: `0 0 * * *` (midnight daily) or `0 */6 * * *` (every 6 hours)
- **OR upgrade to Pro plan** which allows more frequent schedules

**Check Your Plan**:
1. Go to Vercel Dashboard → Settings → Plan
2. Verify which plan you're on

### 2. **Project Root Directory**

**Issue**: If Vercel's project root is set to the repository root (not `back-end/`), it won't find `vercel.json`.

**Check**:
1. Vercel Dashboard → Your Project → Settings → General
2. Look for "Root Directory" setting
3. Should be set to `back-end` if that's where your `vercel.json` is

**Solution**:
- If root is set to repository root, either:
  - Move `vercel.json` to repository root, OR
  - Change Vercel project root to `back-end`

### 3. **Deployment Type**

**Issue**: Cron jobs only work on **production** deployments, not preview deployments.

**Check**:
1. Vercel Dashboard → Deployments
2. Ensure you're looking at production deployments (not preview)
3. Cron jobs tab only appears for production

**Solution**: 
- Deploy to production branch (usually `main` or `master`)
- Don't check cron jobs on preview deployments

### 4. **Cron Expression Validation**

**Current Schedules**:
- `* * * * *` - Every minute (might not be allowed on Hobby)
- `*/10 * * * *` - Every 10 minutes (might not be allowed on Hobby)

**Valid Cron Format**: `minute hour day month weekday`
- `0 0 * * *` - Daily at midnight
- `0 */6 * * *` - Every 6 hours
- `*/30 * * * *` - Every 30 minutes (might work on Pro)

**Solution**: 
- For Hobby plan, use daily schedules
- For Pro plan, more frequent schedules are allowed

### 5. **CRON_SECRET Environment Variable**

**Issue**: If `CRON_SECRET` has invalid characters or newlines, it can prevent cron registration.

**Check**:
1. Vercel Dashboard → Settings → Environment Variables
2. Verify `CRON_SECRET` exists and has no newlines/special characters

**Solution**: 
- Regenerate if needed: `openssl rand -hex 32`
- Ensure no newlines or spaces

### 6. **API Route Existence**

**Verify Routes Exist**:
- ✅ `back-end/src/app/api/cron/router/route.ts` - EXISTS
- ✅ `back-end/src/app/api/cron/health-monitor/route.ts` - EXISTS
- ✅ Both have `export const dynamic = 'force-dynamic';` - CORRECT

### 7. **Build Output Verification**

**Check Build Output**:
1. Deploy to Vercel
2. After deployment, check build logs
3. Look for any errors about `vercel.json` or cron jobs
4. Check `.vercel/output/config.json` (if accessible) for `crons` property

## Step-by-Step Diagnostic Process

1. **Check Vercel Plan**:
   ```
   Dashboard → Settings → Plan
   ```
   - If Hobby: Change cron schedules to daily
   - If Pro: Schedules should be fine

2. **Verify Project Root**:
   ```
   Dashboard → Project → Settings → General → Root Directory
   ```
   - Should match where `vercel.json` is located

3. **Check Deployment Type**:
   ```
   Dashboard → Deployments
   ```
   - Ensure production deployment (not preview)
   - Cron jobs tab only appears on production

4. **Verify Environment Variables**:
   ```
   Dashboard → Settings → Environment Variables
   ```
   - `CRON_SECRET` should exist
   - No newlines or invalid characters

5. **Check Build Logs**:
   ```
   Dashboard → Deployments → [Latest] → Build Logs
   ```
   - Look for cron job registration messages
   - Check for any errors

6. **Manual Test Routes**:
   - Visit `https://your-domain.vercel.app/api/cron/router` (should return 401 without auth)
   - Visit `https://your-domain.vercel.app/api/cron/health-monitor` (should return 401 without auth)
   - If routes don't exist, cron jobs won't register

## Recommended Fix for Hobby Plan

If you're on Hobby plan, update `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/router",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/health-monitor",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

**Note**: Even this might not work on Hobby. Hobby plan typically only allows once-per-day schedules.

## Alternative: Use Pro Plan or Different Approach

If you need frequent execution:
1. **Upgrade to Pro Plan** - Allows more frequent cron jobs
2. **Use External Cron Service** - GitHub Actions, external cron service
3. **Reduce Frequency** - Run less frequently and batch process

