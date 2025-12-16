# Fix: "Application failed to load" Error

## The Problem

The authorization URL (`https://sellercentral.amazon.com/apps/authorize/consent?...`) is showing "Application failed to load" because **the app isn't properly configured yet**. This is expected - you need to configure the app in the Solution Provider Portal FIRST.

## Why This Happens

The authorization page tries to load your app's details, but if the app isn't properly set up in the Solution Provider Portal, it fails to load.

## Solution: Configure App in Solution Provider Portal First

### Step 1: Access Solution Provider Portal

**Try these URLs (one should work):**
1. https://developer.amazon.com/solution-providers
2. https://developer.amazon.com/sp-api/solution-provider  
3. https://sellercentral.amazon.com/apps/develop

**If none work:**
- You may need to be added as a user to the Solution Provider account
- Contact Amazon Support or whoever originally set up the app

### Step 2: Find and Edit Your App

1. Look for your app in the list (should show "Little Hero Labs Production" or similar)
2. Click on the app name or "Edit" button
3. You should see app configuration/settings

### Step 3: Configure OAuth Settings

In the app settings, find the OAuth section and set:

**OAuth Login URI:**
```
https://littleherolabs.com
```

**OAuth Redirect URI:**
```
https://localhost
```

**IMPORTANT:** For private apps, Amazon said you don't need OAuth, but the redirect URI still needs to be set. Use `https://localhost` as it's the standard for self-authorization.

### Step 4: Verify Roles

In the app settings, find the "Roles" section and ensure:
- ✅ **Buyer Communication** is checked (REQUIRED for Messaging API)
- ✅ Any other roles you need

### Step 5: Save Changes

Click "Save" or "Update" after making changes.

### Step 6: Self-Authorize (After Configuration)

**ONLY AFTER** the app is configured, try one of these:

**Option A: Look for "Authorize" or "Get Refresh Token" button in Solution Provider Portal**
- Many portals have a direct button/link to authorize
- This is the preferred method

**Option B: Use Authorization URL (after app is configured)**
```
https://sellercentral.amazon.com/apps/authorize/consent?application_id=[REDACTED_CLIENT_ID]&state=test123&version=beta&redirect_uri=https://localhost
```

**This URL will only work AFTER the app is properly configured in Step 3-5.**

### Step 7: Get Refresh Token

After authorization completes:
1. In Solution Provider Portal, look for:
   - "View Credentials" or "View sandbox credentials"
   - "Refresh Token" section
   - "Credentials" tab
2. Copy the refresh token (starts with `Atzr|`)
3. Update `AMZ_REFRESH_TOKEN` in Cloudflare Pages environment variables
4. Redeploy

## What Your Code Does (Token Exchange)

Your code already handles the token exchange automatically. The request looks like:

```
POST https://api.amazon.com/auth/o2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
refresh_token=YOUR_REFRESH_TOKEN
client_id=[REDACTED_CLIENT_ID]
client_secret=[REDACTED_CLIENT_SECRET]
```

You don't need to manually run this - your code does it automatically when calling the API.

## Next Steps

1. **First priority:** Access Solution Provider Portal and configure the app (Steps 1-5)
2. **Then:** Self-authorize the app (Step 6)
3. **Finally:** Get refresh token and update environment variables (Step 7)

## If You Still Can't Access Solution Provider Portal

Contact Amazon Support with:
- Your App ID: `amzn1.sp.solution.3e928368-7705-40e7-806f-d9d25b42516c`
- Your Client ID: `[REDACTED_CLIENT_ID]`
- Ask: "I need to access the Solution Provider Portal to configure my SP-API app for self-authorization. How do I access it?"


