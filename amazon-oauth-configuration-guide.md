# Amazon SP-API OAuth Configuration Guide

## Context
Amazon Support has requested that you:
1. Edit your app and add all roles available to select
2. Configure OAuth URIs for self-authorization
3. Self-authorize the app for the Buyer Communication role

**App ID**: `amzn1.sp.solution.3e928368-7705-40e7-806f-d9d25b42516c`

---

## Step 1: Configure OAuth URIs

In the OAuth configuration section (shown in your image), fill in:

### **OAuth Login URI:**
```
https://littleherolabs.com
```
*(This is where Amazon redirects users to log in. For self-authorization, your main website URL is sufficient.)*

### **OAuth Redirect URI:**
```
https://localhost
```
*(This is where Amazon redirects back after authorization. `https://localhost` is the standard for SP-API self-authorization and works for both testing and production.)*

**OR** if you prefer a production callback URL:
```
https://littleherolabs.com/auth/amazon/callback
```

**Recommendation**: Use `https://localhost` - it's simpler and works for self-authorization.

---

## Step 2: Add All Available Roles

1. In the app edit page, scroll to the **"Roles"** section
2. **Check ALL available roles**, including:
   - ✅ Buyer Communication (required for Messaging API)
   - ✅ Orders (if available)
   - ✅ Notifications (if available)
   - ✅ Any other roles shown
3. **Save** the changes

---

## Step 3: Self-Authorize the App

After saving the OAuth configuration and roles:

1. **Go to**: [Amazon Self-Authorization Guide](https://developer-docs.amazon.com/sp-api/docs/self-authorization)

2. **Or use this direct URL** (replace `YOUR_CLIENT_ID` with your actual Client ID):
   ```
   https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID&state=test123&version=beta&redirect_uri=https://localhost
   ```

3. **Complete the authorization flow**:
   - You'll be redirected to Amazon to authorize the app
   - Select all the roles you need (especially "Buyer Communication")
   - After authorization, you'll be redirected back to `https://localhost` (you may see a blank page - that's normal)
   - The authorization is complete when you see the redirect

4. **Get your new Refresh Token**:
   - After self-authorization, you'll need to get a new refresh token
   - Check the app's credentials page or use the OAuth flow to obtain it
   - Update your `AMZ_REFRESH_TOKEN` environment variable in Cloudflare Pages

---

## Step 4: Verify Configuration

After completing the above steps:

1. **Test the Messaging API**:
   ```bash
   curl "https://admin.littleherolabs.com/api/admin/test-amazon-messaging?orderId=111-0060602-1283417"
   ```

2. **Check for errors**:
   - If you still get 403 errors, verify the app status shows "Authorized" or "Published" (not "Draft")
   - Ensure the Buyer Communication role is checked in the app settings
   - Verify your refresh token was updated after self-authorization

---

## Notes

- **OAuth Login URI**: Can be your main website URL - it's just a landing page for the OAuth flow
- **OAuth Redirect URI**: `https://localhost` is standard for SP-API self-authorization and works for both sandbox and production
- **Self-Authorization**: This is you authorizing your own app, so you don't need a complex OAuth callback handler
- **Refresh Token**: You'll need a new refresh token after self-authorization - the old one won't work with the newly authorized roles

---

## Troubleshooting

**If you get "redirect_uri mismatch" errors:**
- Ensure the redirect URI in the OAuth URL matches exactly what you entered in the app configuration
- No trailing slashes, correct protocol (https)

**If the app still shows "Draft" status:**
- Some apps require additional setup steps before they can be published
- Contact Amazon Support if you can't find a publish/activate button

**If you still get 403 errors after self-authorization:**
- Verify the Buyer Communication role is checked in the app settings
- Ensure you got a new refresh token after self-authorization
- Check that the app status is "Authorized" or "Published"



