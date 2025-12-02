# Getting Production Amazon SP-API Credentials

**Date**: December 2, 2025  
**Current Status**: Using sandbox credentials  
**When Needed**: When Amazon Custom listing is created and ready for real orders

---

## ✅ **Current Situation**

You have **sandbox credentials** from the Amazon Solution Provider Portal:
- **App**: "Little Hero Labs Printing"
- **Status**: Sandbox
- **Good for**: Development and testing
- **Not good for**: Real customer orders

---

## 🎯 **When to Get Production Credentials**

**Don't rush!** Get production credentials when:
- ✅ Amazon Custom listing is created
- ✅ Ready to test with real customer orders
- ✅ Ready to launch to customers

**You can keep using sandbox until then** - it won't hinder your progress.

---

## 🔄 **How to Get Production Credentials**

### **Option 1: Promote Sandbox App** (Recommended)

1. **Go to**: Amazon Solution Provider Portal
   - URL: https://developer.amazonservices.com

2. **Find Your App**: "Little Hero Labs Printing"

3. **Look for**: "Promote to Production" or "Request Production Access"

4. **Complete**: Any required forms or verification

5. **Get**: Production LWA credentials (Client ID, Secret, Refresh Token)

6. **Update**: Your `.env.local` file

---

### **Option 2: Create Production App in Seller Central**

1. **Go to**: Amazon Seller Central
   - URL: https://sellercentral.amazon.com

2. **Navigate to**: Apps & Services → Develop Apps

3. **Create New App**:
   - App name: "Little Hero Labs" (or similar)
   - Select: Production access

4. **Complete OAuth Flow**:
   - Authorize the app
   - Get Refresh Token

5. **Save Credentials**:
   - Client ID: `amzn1.application-oa2-client.xxxxx`
   - Client Secret: `amzn1.oa2-cs.v1.xxxxx`
   - Refresh Token: `Atzr|xxxxx`

6. **Update**: Your `.env.local` file

---

## 📝 **Update Environment Variables**

Once you have production credentials:

**File**: `back-end/.env.local`

**Replace**:
```bash
# === Amazon SP-API Configuration ===
# OLD (Sandbox)
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_REFRESH_TOKEN=Atzr|IwEBIA... (sandbox token)
AMAZON_SANDBOX_MODE=true

# NEW (Production)
AMZ_APP_CLIENT_ID=your_production_client_id
AMZ_APP_CLIENT_SECRET=your_production_client_secret
AMZ_REFRESH_TOKEN=Atzr|your_production_refresh_token
AMAZON_SANDBOX_MODE=false  # ← Change to false
```

**Keep the same**:
```bash
# These don't change
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na

# AWS IAM credentials stay the same (already production)
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=****************************************
AWS_REGION=us-east-1
```

---

## 🔄 **Restart Backend Server**

After updating `.env.local`:

```bash
cd back-end
npm run dev
```

---

## 🧪 **Test Production Credentials**

Once backend is restarted:

```bash
curl -X POST http://localhost:3000/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "REAL-AMAZON-ORDER-ID",
    "token": "test-token",
    "reminderType": "initial"
  }'
```

**Expected**: Should work with real Amazon order IDs

---

## ⚠️ **Important Notes**

### **Don't Delete Sandbox Credentials**
- Keep sandbox credentials in a safe place
- You might need them for testing later
- Consider keeping them in a separate file: `back-end/.env.sandbox`

### **AWS IAM Credentials Don't Change**
- Your AWS IAM credentials work for BOTH sandbox and production
- No need to create new AWS IAM credentials
- Same Access Key ID and Secret work for everything

### **Test Thoroughly**
- Test with 1-2 real orders first
- Verify messages send correctly
- Confirm order fetching works
- Check all integrations before full launch

---

## 📋 **Checklist**

### **Before Getting Production Credentials**:
- [ ] Amazon Custom listing created
- [ ] Product images uploaded
- [ ] Listing approved by Amazon
- [ ] Ready to test with real orders

### **Getting Production Credentials**:
- [ ] Choose Option 1 (promote) or Option 2 (new app)
- [ ] Complete OAuth flow
- [ ] Save Client ID, Secret, Refresh Token
- [ ] Update `back-end/.env.local`
- [ ] Change `AMAZON_SANDBOX_MODE=false`
- [ ] Restart backend server

### **After Switching to Production**:
- [ ] Test API with real order
- [ ] Verify Amazon Messaging works
- [ ] Test order fetching (Workflow 0)
- [ ] Confirm end-to-end flow
- [ ] Monitor first 5-10 orders closely

---

## 🎯 **Timeline**

### **Now** (Keep Sandbox):
- ✅ Continue development
- ✅ Test with sandbox
- ✅ AWS IAM credentials ready

### **Week 1-2** (Developer A Creates Listing):
- ⏳ Amazon Custom listing created
- ⏳ Product images uploaded
- ⏳ Listing approved

### **Week 3** (Switch to Production):
- Get production credentials
- Update `.env.local`
- Test with real orders

### **Week 4+** (Launch):
- Full production testing
- Launch to customers
- Monitor and optimize

---

## 📞 **Need Help?**

If you have issues getting production credentials:
1. Check Amazon Seller Central help docs
2. Contact Amazon SP-API support
3. Check Solution Provider Portal documentation

---

**Summary**: Keep using sandbox credentials for now. Get production credentials when Developer A creates the Amazon Custom listing and you're ready to test with real orders. No rush! 🚀

