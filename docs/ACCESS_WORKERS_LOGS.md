# How to Access Cloudflare Workers Logs

**This is critical** - The Workers Logs will show the **actual error message** that's causing "Error 1101: Worker threw exception".

## Steps to Access Logs

### Option 1: Via Cloudflare Dashboard (Recommended)

1. Go to **Cloudflare Dashboard**: https://dash.cloudflare.com
2. Select your account
3. Click **Workers & Pages** in the left sidebar
4. Click on your project: **`little-hero-labs-admin`** (or `bright-gift`)
5. Click on the **Logs** tab (or **Real-time Logs**)
6. **Trigger a request** to your site (refresh the page or visit `https://admin.littleherolabs.com`)
7. **Look for errors** in the logs - they will show:
   - The exact error message
   - Stack trace
   - Which module/function failed
   - Line numbers (if available)

### Option 2: Via Wrangler CLI

```bash
# Stream real-time logs
npx wrangler tail --project-name=little-hero-labs-admin

# Or for bright-gift project
npx wrangler tail --project-name=bright-gift
```

Then visit your site in another terminal/window to trigger requests.

## What to Look For

The logs will show errors like:
- `TypeError: Cannot read property 'x' of undefined`
- `ReferenceError: X is not defined`
- `Import error: Cannot resolve module './xyz'`
- `S3Client configuration error`
- etc.

## After Getting the Error

Once you have the actual error message from the logs, share it and we can fix the specific issue.

The error message will tell us:
- What module is failing
- What operation is failing
- Why it's failing

**Without the actual error from logs, we're just guessing.**

