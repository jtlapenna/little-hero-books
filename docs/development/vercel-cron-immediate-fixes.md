# Immediate Fixes for Vercel Cron Jobs

## Most Likely Issue: Plan Limitations

**Hobby Plan**: Only allows cron jobs to run **once per day**
**Pro Plan**: Allows more frequent schedules

## Current Configuration (Updated for Hobby Plan)

I've updated `vercel.json` to use daily schedules that will work on Hobby plan:
- Router: `0 0 * * *` (Daily at midnight)
- Health Monitor: `0 0 * * *` (Daily at midnight)

**Note**: Both run at the same time. If you need them at different times:
- Router: `0 0 * * *` (midnight)
- Health Monitor: `0 12 * * *` (noon)

## If You're on Pro Plan

If you're on Pro plan, you can use more frequent schedules:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/router",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/health-monitor",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

## Steps to Fix

1. **Check Your Vercel Plan**:
   - Dashboard → Settings → Plan
   - Note which plan you're on

2. **Verify Project Root**:
   - Dashboard → Project → Settings → General
   - Root Directory should be `back-end` (or wherever `vercel.json` is)

3. **Deploy to Production**:
   - Push changes to main/master branch
   - Wait for production deployment to complete

4. **Check Cron Jobs Tab**:
   - Dashboard → Project → Settings → Cron Jobs
   - Should appear after production deployment
   - **Only appears on production, not preview deployments**

5. **If Still Not Showing**:
   - Check build logs for errors
   - Verify `CRON_SECRET` environment variable is set
   - Try manually visiting the routes to ensure they exist

## Alternative: If You Need More Frequent Execution

If you need more frequent execution than Hobby plan allows:

1. **Upgrade to Pro Plan** ($20/month)
2. **Use GitHub Actions Cron** (free, runs on schedule)
3. **Use External Cron Service** (cron-job.org, EasyCron, etc.)
4. **Keep n8n polling** (but optimize to reduce executions)

