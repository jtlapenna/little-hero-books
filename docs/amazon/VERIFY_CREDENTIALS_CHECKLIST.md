# Amazon SP-API Credentials Verification Checklist

**Issue**: "Not authorized for requested operation" error despite app being authorized

**Root Cause**: Credential mismatch between Seller Central and Cloudflare Pages

---

## ✅ **Step-by-Step Verification**

### **1. Verify Refresh Token Matches**

**In Seller Central** (from your screenshot):
- Refresh Token: `Atzr|IwEBIHi_Ua5O_dkpYgJotUujN0W4WdjoNNlavWuxelCfex82zPknfrpPGkWctfgTVZf-4vAeHuZgg8erJ0P5NbQxP4yMGUjYr_cBpr1hyt8jBavJWrkutJDTHUsnKbwvMsvxlypaWfPMXXW7`

**In Cloudflare Pages**:
1. Go to: Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables
2. Check `AMZ_REFRESH_TOKEN`
3. **Must match EXACTLY** (including the `Atzr|` prefix)
4. Copy the token from Seller Central and paste it into Cloudflare

**Common Issues**:
- ❌ Missing `Atzr|` prefix
- ❌ Extra spaces or line breaks
- ❌ Old token (regenerated but not updated in Cloudflare)

---

### **2. Verify Client ID Matches**

**In Seller Central**:
1. Go to: Apps & Services → Develop Apps → "Little Hero Labs Production"
2. Click "View" under LWA credentials
3. Copy the **Client ID** (starts with `amzn1.application-oa2-client.`)

**In Cloudflare Pages**:
1. Check `AMZ_APP_CLIENT_ID`
2. **Must match EXACTLY** the Client ID from Seller Central

---

### **3. Verify Client Secret Matches**

**In Seller Central**:
1. Same page as above (LWA credentials)
2. Copy the **Client Secret** (starts with `amzn1.oa2-cs.v1.`)

**In Cloudflare Pages**:
1. Check `AMZ_APP_CLIENT_SECRET`
2. **Must match EXACTLY** the Client Secret from Seller Central

**Note**: Client Secret is long (100+ characters). Make sure you copied the entire value.

---

### **4. Verify Seller ID**

**In Seller Central**:
1. Go to: Settings → Account Info
2. Find your **Seller ID** (starts with `A` followed by alphanumeric characters)
3. Example: `A2V719MRGLK48O`

**In Cloudflare Pages**:
1. Check `AMZ_SELLER_ID`
2. **Must match EXACTLY** your Seller ID from Account Info

---

### **5. Verify App Roles**

**In Seller Central**:
1. Go to: Apps & Services → Develop Apps → "Little Hero Labs Production"
2. Click on the app name to view details
3. Scroll to "Roles" section
4. **Verify "Buyer Communication" is enabled** ✅

**If not enabled**:
- This role is required for sending messages via Amazon Message Center
- Contact Amazon support to enable it (or check if it's available in your app settings)

---

### **6. Verify All Environment Variables in Cloudflare**

**Required Variables** (all must be set):
```bash
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_REFRESH_TOKEN=Atzr|IwEBIHi_Ua5O_dkpYgJotUujN0W4WdjoNNlavWuxelCfex82zPknfrpPGkWctfgTVZf-4vAeHuZgg8erJ0P5NbQxP4yMGUjYr_cBpr1hyt8jBavJWrkutJDTHUsnKbwvMsvxlypaWfPMXXW7
AMZ_SELLER_ID=A2V719MRGLK48O  # Your actual Seller ID
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

**Important**:
- ✅ Set for **Production** environment (not Preview)
- ✅ No extra spaces or quotes
- ✅ Values match Seller Central exactly

---

### **7. After Updating Credentials**

1. **Redeploy** your Cloudflare Pages project (or wait for auto-deploy)
2. **Test** using the diagnostic endpoint:
   ```
   GET /api/admin/test-amazon-messaging?orderId=111-0060602-1283417
   ```
3. **Check Step 3** in the response - it should show "LWA access token obtained successfully"

---

## 🔍 **Troubleshooting**

### **If refresh token still doesn't work:**

1. **Regenerate refresh token**:
   - In Seller Central → Manage Authorizations
   - Click "Authorize app" again
   - Copy the NEW refresh token
   - Update `AMZ_REFRESH_TOKEN` in Cloudflare

2. **Verify app is not in Draft status**:
   - App should show as "Authorized" (which yours does ✅)
   - If it shows "Draft", you may need to complete app setup

3. **Check for typos**:
   - Copy-paste directly (don't type manually)
   - No extra spaces before/after values
   - No quotes around values in Cloudflare

4. **Verify environment**:
   - Make sure variables are set for **Production** environment
   - Preview environment uses different variables

---

## 📝 **Quick Copy Checklist**

After verifying each item, check it off:

- [ ] Refresh token matches exactly (including `Atzr|` prefix)
- [ ] Client ID matches exactly
- [ ] Client Secret matches exactly (full length)
- [ ] Seller ID matches exactly
- [ ] Buyer Communication role is enabled
- [ ] All variables set in Cloudflare Pages (Production)
- [ ] Redeployed after updating credentials
- [ ] Test endpoint shows "LWA access token obtained successfully"

---

## 🚨 **Most Common Issue**

**90% of "Not authorized" errors are caused by:**
- Refresh token mismatch (old token in Cloudflare)
- Client ID/Secret mismatch (typo or wrong app)
- Seller ID mismatch (wrong account)

**Solution**: Copy-paste all values directly from Seller Central to Cloudflare Pages, then redeploy.

