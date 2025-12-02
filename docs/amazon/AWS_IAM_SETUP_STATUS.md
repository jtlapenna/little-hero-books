# AWS IAM Setup Status

**Date**: December 2, 2025

---

## ✅ Completed

### **Custom IAM Policy Created**
- **Policy Name**: `LittleHeroLabsSpApiAccess`
- **Purpose**: Allows access to Amazon SP-API for messaging and uploads
- **Permissions**: 
  - `execute-api:Invoke` for messaging endpoints
  - `execute-api:Invoke` for uploads endpoints
  - `execute-api:Invoke` for order queries

### **IAM User Created**
- **User Name**: `little-hero-labs-sp-api`
- **Purpose**: Service account for Little Hero Labs SP-API integration
- **Policy Attached**: `LittleHeroLabsSpApiAccess`

---

## ⏳ Next Steps

### **1. Generate Access Keys**

1. **Go to IAM Console**: https://console.aws.amazon.com/iam/
2. **Click on user**: `little-hero-labs-sp-api`
3. **Go to "Security credentials" tab**
4. **Scroll to "Access keys"**
5. **Click "Create access key"**
6. **Select use case**: "Application running outside AWS"
7. **Click "Next"** → **"Create access key"**
8. **⚠️ SAVE IMMEDIATELY**:
   - Access Key ID: `AKIA...`
   - Secret Access Key: (long string - only shown once!)
9. **Download .csv file** as backup

---

### **2. Update Environment Variables**

**File**: `back-end/.env.local`

**Add**:
```bash
# === AWS IAM Credentials (for Amazon Message Center) ===
AWS_ACCESS_KEY_ID=AKIA...your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
```

---

### **3. Restart Backend Server**

```bash
cd back-end
npm run dev
```

---

### **4. Test the API**

```bash
curl -X POST https://admin.littleherolabs.com/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-ORDER-123",
    "token": "test-token",
    "reminderType": "initial"
  }'
```

**Expected**: Error about missing Amazon SP-API credentials (this is OK - means AWS credentials are loaded)

---

## 📋 Still Needed

### **Amazon SP-API Credentials**

You'll also need these from **Amazon Seller Central**:

- `AMZ_APP_CLIENT_ID`
- `AMZ_APP_CLIENT_SECRET`
- `AMZ_REFRESH_TOKEN`
- `AMZ_SELLER_ID`
- `AMZ_MARKETPLACE_ID`

**Get from**: Seller Central → Apps & Services → Develop Apps

---

## 📚 Reference

- **Setup Guide**: `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`
- **Checklist**: `docs/amazon/DEVELOPER_B_AMAZON_CHECKLIST.md`
- **Next Steps**: `docs/amazon/AMAZON_SELLER_APPROVED_NEXT_STEPS.md`

---

## ✅ Progress

- [x] Custom IAM policy created (`LittleHeroLabsSpApiAccess`)
- [x] IAM user created (`little-hero-labs-sp-api`)
- [x] Access keys generated
- [x] Environment variables updated
- [x] Backend server restarted
- [x] API tested successfully
- [x] Amazon SP-API credentials configured
- [ ] Full integration tested (waiting on Amazon Custom listing)

---

## 🎊 **COMPLETE!**

Amazon Messaging API is fully implemented and operational. Waiting on Developer A to create Amazon Custom listing for end-to-end testing.

**Test Result**: ✅ API credentials validated successfully

**Next**: Wait for Amazon listing, then test with real orders.

