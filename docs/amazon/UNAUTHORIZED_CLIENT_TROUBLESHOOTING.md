# Troubleshooting "unauthorized_client" Error

**Error**: `unauthorized_client` with "Not authorized for requested operation"  
**Status**: Credentials verified and match ✅

---

## 🔍 **Additional Checks (Beyond Credentials)**

Since you've verified all credentials match, check these other potential issues:

### **1. App Roles - CRITICAL CHECK** ⚠️

**The "Buyer Communication" role MUST be enabled in the app settings.**

**Steps**:
1. Go to: Seller Central → Apps & Services → Develop Apps
2. Click on **"Little Hero Labs Production"** (click the app name, not just "View")
3. Scroll to **"Roles"** section
4. Verify **"Buyer Communication"** is checked/enabled ✅

**If not enabled**:
- Click "Edit" on the app
- Enable "Buyer Communication" role
- Save changes
- **Regenerate refresh token** after enabling the role
- Update `AMZ_REFRESH_TOKEN` in Cloudflare Pages

---

### **2. App Status**

**Check if app is in correct state**:
1. Go to: Seller Central → Apps & Services → Develop Apps
2. Find "Little Hero Labs Production"
3. Check the status:
   - ✅ **"Authorized"** or **"Published"** = Good
   - ⚠️ **"Draft"** = May need to complete setup

**If in Draft**:
- Complete any pending app setup steps
- Some APIs require app to be published/approved

---

### **3. LWA Security Profile Configuration**

**Check security profile settings**:
1. Go to: [Login with Amazon Developer Console](https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html)
2. Find the security profile associated with your app
3. Check **"Allowed Return URLs"**:
   - Should include your redirect URI
   - Must match exactly (no trailing slashes, correct protocol)

**Common issues**:
- Return URL mismatch
- Missing return URL
- Wrong protocol (http vs https)

---

### **4. API Access Permissions**

**Verify app has access to Messaging API**:
1. Go to: Seller Central → Apps & Services → Develop Apps
2. Click on "Little Hero Labs Production"
3. Check **"API Access"** or **"Permissions"** section
4. Verify **"Messaging API"** or **"Buyer Communication"** is listed

**If missing**:
- Contact Amazon Developer Support
- Request access to Messaging API
- May need to complete additional app review

---

### **5. Seller Account Authorization**

**Verify the refresh token is for the correct seller account**:
1. Go to: Seller Central → Apps & Services → Manage Authorizations
2. Find "Little Hero Labs Production"
3. Check **"Self Authorizations"** section
4. Verify the seller account matches `AMZ_SELLER_ID` in Cloudflare

**Common issues**:
- Refresh token for different seller account
- Multiple seller accounts, using wrong one
- Seller ID mismatch

---

### **6. Regenerate Refresh Token After Changes**

**If you made ANY changes to app roles or settings**:
1. Go to: Seller Central → Manage Authorizations
2. Click **"Authorize app"** again
3. This generates a NEW refresh token
4. Copy the new token
5. Update `AMZ_REFRESH_TOKEN` in Cloudflare Pages
6. Redeploy

**Important**: Any change to app roles or permissions requires a new refresh token.

---

### **7. Test with Different Credentials**

**If still failing, try**:
1. Create a new security profile in LWA Developer Console
2. Update app to use new Client ID/Secret
3. Generate new refresh token
4. Update all credentials in Cloudflare
5. Test again

This helps determine if the issue is with the security profile itself.

---

## 🎯 **Most Likely Issue**

Based on the error and verified credentials, the most likely cause is:

**App roles not enabled** - Specifically, the "Buyer Communication" role must be enabled in the app settings. This is separate from:
- ✅ App authorization (you have this)
- ✅ Refresh token generation (you have this)
- ❌ **App roles** (check this!)

---

## 📝 **Quick Verification Checklist**

- [ ] "Buyer Communication" role is enabled in app settings
- [ ] App status is "Authorized" or "Published" (not Draft)
- [ ] LWA security profile return URLs are correct
- [ ] App has API access to Messaging API
- [ ] Refresh token matches the seller account in `AMZ_SELLER_ID`
- [ ] Regenerated refresh token after enabling roles (if needed)
- [ ] Redeployed Cloudflare Pages after updating credentials

---

## 🚨 **If Still Failing**

If all of the above are correct and you're still getting `unauthorized_client`:

1. **Contact Amazon Developer Support**:
   - Provide the error code: `unauthorized_client`
   - Provide the request ID from the error response
   - Explain that credentials are verified and match
   - Ask them to check app configuration on their end

2. **Check Amazon SP-API Status**:
   - Verify there are no service outages
   - Check Amazon SP-API status page

3. **Review Amazon Documentation**:
   - [SP-API Authorization Guide](https://developer-docs.amazon.com/sp-api/docs/authorizing-selling-partner-api-applications)
   - [LWA Security Profile Setup](https://developer.amazon.com/docs/login-with-amazon/security-profile.html)


   https://sellercentral.amazon.com/apps/authorize/consent?application_id=amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58&state=test123&version=beta&redirect_uri=https://littleherolabs.com