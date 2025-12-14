# Fix: "Access to requested resource is denied" (403 Unauthorized)

**Error**: `Access to requested resource is denied. (Code: Unauthorized)`  
**Status Code**: 403 Forbidden  
**Issue**: Amazon is denying access to the Messaging API endpoint

---

## 🔍 Root Cause

After getting SP-API approval, your application needs:
1. ✅ **Buyer Communication role** enabled in Developer Profile
2. ✅ **Application re-authorized** for your seller account
3. ✅ **Valid refresh token** that matches the authorized app

---

## ✅ Step-by-Step Fix

### Step 1: Verify Application Roles

**Go to**: Amazon Seller Central → Developer Profile  
**URL**: https://sellercentral.amazon.com/developer/register

**Check**:
1. Find your application: "Little Hero Labs Production" (or similar)
2. Click on it to view details
3. Verify **"Buyer Communication"** role is:
   - ✅ Listed in your roles
   - ✅ Status: **Active** or **Approved**
   - ✅ Not showing as "Pending" or "Rejected"

**If Missing**:
- Click "Edit" or "Manage Roles"
- Enable "Buyer Communication" role
- Save changes
- Wait for approval (may be instant or take a few minutes)

---

### Step 2: Re-Authorize Your Application

**Why**: After SP-API approval, you may need to re-authorize the app.

**Go to**: Amazon Seller Central → Apps & Services → Develop Apps  
**URL**: https://sellercentral.amazon.com/apps/develop

**Steps**:
1. Find your application: "Little Hero Labs Production"
2. Click on it
3. Look for **"Authorize"** or **"Manage Authorizations"** button
4. Click it
5. Select your seller account (`A2V719MRGLK48O`)
6. Grant all requested permissions
7. Complete the authorization flow

**Alternative Path**:
- Go to: Apps & Services → Manage Authorizations
- Find your app
- Click "Authorize" or "Re-authorize"

---

### Step 3: Get New Refresh Token

**After re-authorization**, you need a new refresh token:

**Option A: Via Seller Central (Easier)**
1. Go to: Apps & Services → Develop Apps
2. Click on your app
3. Click **"View LWA credentials"** or **"Show refresh token"**
4. Copy the refresh token (starts with `Atzr|`)
5. Update in Cloudflare Pages / Vercel environment variables

**Option B: Via OAuth Flow (If needed)**
1. Generate OAuth authorization URL:
   ```
   https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID&state=test123&version=beta
   ```
2. Replace `YOUR_CLIENT_ID` with your actual Client ID
3. Open in browser
4. Authorize the app
5. Get refresh token from the response

---

### Step 4: Update Environment Variables

**In Cloudflare Pages** (or Vercel):
1. Go to: Settings → Environment Variables
2. Find: `AMZ_REFRESH_TOKEN`
3. Replace with the **new refresh token** from Step 3
4. **Important**: Make sure there are NO extra spaces or quotes
5. Save
6. **Redeploy** your application

**Verify All Variables Are Set**:
```bash
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
AMZ_REFRESH_TOKEN=Atzr|xxxxx  # ← NEW TOKEN
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AMAZON_SANDBOX_MODE=false
```

---

### Step 5: Test Again

After updating and redeploying:

```bash
curl "https://admin.littleherolabs.com/api/admin/test-amazon-messaging?orderId=111-0060602-1283417"
```

**Expected Results**:
- ✅ Should NOT get "403 Unauthorized" error
- ✅ Should see available actions (if order is unshipped)
- ✅ Or "No suitable messaging action" (if order is shipped/too old - this is OK)

---

## 🔍 Verification Checklist

Before testing, verify:

- [ ] **Buyer Communication role** is enabled in Developer Profile
- [ ] **Application is authorized** for seller account `A2V719MRGLK48O`
- [ ] **Refresh token** was regenerated after authorization
- [ ] **Environment variables** updated in Cloudflare Pages/Vercel
- [ ] **Application redeployed** after updating env vars
- [ ] **Client ID** matches what's in Seller Central
- [ ] **Seller ID** matches the authorized account

---

## 🚨 Common Issues

### Issue 1: "Role not found" or "Role pending"
**Fix**: Wait a few minutes after enabling the role, then re-authorize

### Issue 2: "Refresh token doesn't work"
**Fix**: 
- Make sure you copied the ENTIRE token (starts with `Atzr|`, ~332 characters)
- No extra spaces or quotes
- Token is from the SAME app you're using

### Issue 3: "Still getting 403 after all steps"
**Fix**:
- Check if order `111-0060602-1283417` belongs to seller `A2V719MRGLK48O`
- Try with a different order ID
- Contact Amazon Support with:
  - Application ID: `amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58`
  - Developer Account ID: `A2V719MRGLK48O`
  - Error: 403 Unauthorized on `/messaging/v1/orders/{orderId}`
  - Request ID from error response

---

## 📞 Need Help?

If you're still getting 403 after completing all steps:

1. **Check Amazon SP-API Status**: Make sure there are no service outages
2. **Contact Amazon Developer Support**: 
   - Provide Application ID
   - Provide Developer Account ID
   - Explain you just got SP-API approval
   - Ask them to verify "Buyer Communication" role is active
3. **Check Server Logs**: Look for the full error response with Request ID

---

## ✅ Success Indicators

You'll know it's fixed when:
- ✅ Test endpoint returns available actions (not "403 Unauthorized")
- ✅ Can see `confirmCustomizationDetails` or `confirmOrderDetails` in available actions
- ✅ No more "Access denied" errors

---

**Next Steps After Fix**:
Once 403 is resolved, you should be able to send messages to customers via Amazon Message Center! 🎉

