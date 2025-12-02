# Amazon Credentials Clarification

**Date**: December 2, 2025

---

## 🔑 **Two Different Sets of Credentials**

There are **TWO different sets of credentials** needed for Amazon integration. They serve different purposes:

---

## 1️⃣ **AWS IAM Credentials** (for Request Signing)

### **Purpose**: 
Sign requests to Amazon SP-API using AWS SigV4 signing

### **What They Do**:
- Authenticate API calls to Amazon
- Required for Amazon Messaging API
- Used to sign HTTP requests

### **Status**: ✅ **COMPLETE** (Developer B)

### **Credentials**:
```bash
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=****************************************
AWS_REGION=us-east-1
```

### **How We Got Them**:
1. Created AWS IAM user: `little-hero-labs-sp-api`
2. Created custom policy: `LittleHeroLabsSpApiAccess`
3. Generated access keys
4. Configured in `back-end/.env.local`

### **Used By**:
- Amazon Messaging API (`/api/notifications/preview/amazon`)
- AWS SigV4 request signing
- All Amazon SP-API calls

---

## 2️⃣ **Amazon SP-API Credentials** (for Authorization)

### **Purpose**: 
Authorize access to your Amazon Seller account and orders

### **What They Do**:
- Identify your Amazon Seller account
- Authorize access to orders
- Provide refresh tokens for API access

### **Status**: ✅ **VERIFIED - SANDBOX** (December 2, 2025)

### **Credentials**:
```bash
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AMZ_REFRESH_TOKEN=Atzr|IwEBIA... (long token)
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AMAZON_SANDBOX_MODE=true  # ← Correct - these ARE sandbox credentials
```

### **Source**: Amazon Solution Provider Portal
- **App Name**: "Little Hero Labs Printing"
- **Status**: Sandbox
- **Portal**: https://developer.amazonservices.com

### **How to Get Them**:
1. Go to: Amazon Seller Central → Apps & Services → Develop Apps
2. Create app (or use existing)
3. Complete OAuth flow to get Refresh Token
4. Get Seller ID from account settings

### **Used By**:
- Order fetching (Workflow 0)
- Amazon Messaging API (for order lookup)
- All Amazon SP-API operations

### **Verified**: ✅ **SANDBOX Credentials**
- Source: Amazon Solution Provider Portal
- App: "Little Hero Labs Printing"
- Status: Sandbox
- Good for: Development and testing
- Not good for: Real customer orders (need production credentials)

---

## 🤔 **Why Two Sets?**

### **AWS IAM Credentials**:
- Prove you're authorized to make API calls
- Like showing your ID at the door

### **Amazon SP-API Credentials**:
- Prove which Amazon Seller account you're accessing
- Like showing your membership card

**Both are required** for Amazon Messaging API to work!

---

## ✅ **What's Complete vs. What's Needed**

### **Complete** ✅ (Developer B):
- [x] AWS IAM user created
- [x] AWS IAM policy created
- [x] AWS access keys generated
- [x] AWS credentials configured in `.env.local`
- [x] Amazon Messaging API code implemented
- [x] API endpoint tested

### **Needs Verification** ⚠️ (Developer A):
- [ ] Verify if Amazon SP-API credentials are production or sandbox
- [ ] If sandbox: Get production credentials
- [ ] If production: Verify they work with real orders
- [ ] Update `AMAZON_SANDBOX_MODE` to `false` if using production
- [ ] Test with real Amazon order

---

## 🧪 **How to Verify**

### **Check Current Status**:
```bash
# Look in back-end/.env.local
AMAZON_SANDBOX_MODE=true  # ← If true, using sandbox
```

### **Test with Real Order** (Once Listing Created):
1. Place test order through Amazon Custom listing
2. Check if order appears in Workflow 0
3. If order appears → Production credentials working ✅
4. If order doesn't appear → Need production credentials ⚠️

---

## 📋 **Summary**

| Credential Type | Purpose | Status | Owner |
|----------------|---------|--------|-------|
| **AWS IAM** | Request signing | ✅ Complete | Developer B |
| **Amazon SP-API** | Order access | ⚠️ Verify | Developer A |

**Next Step**: Developer A needs to verify if Amazon SP-API credentials are production or sandbox, and update if needed.

---

## 🎯 **For Developer A**

**Quick Check**:
1. Look at `AMAZON_SANDBOX_MODE` in `back-end/.env.local`
2. If `true` → You need to get production credentials
3. If `false` → Credentials should be production (verify with test order)

**If You Need Production Credentials**:
1. Go to Amazon Seller Central → Apps & Services → Develop Apps
2. Get production Client ID, Secret, and Refresh Token
3. Update `back-end/.env.local`
4. Set `AMAZON_SANDBOX_MODE=false`
5. Restart backend server

**Reference**: `docs/amazon/AMAZON_SETUP_GUIDE.md`

