# Amazon Integration - Complete Setup Guide
## Everything You Need to Connect Amazon Orders to Your Workflows

---

## 🎯 **Overview**

This guide covers:
1. **Getting Amazon Credentials** (SP-API + AWS IAM)
2. **Configuring Environment Variables**
3. **Setting Up n8n Workflow 0** (Amazon order fetching)
4. **Setting Up Amazon Message Center** (customer preview notifications)

> **Using Sandbox?** Set `AMAZON_SANDBOX_MODE=true` in `.env.local`. Code automatically uses sandbox endpoints. Switch to production by just changing credentials.

---

## 📋 **Part 1: Get Amazon Credentials**

### **A. SP-API Credentials** (For Order Fetching)

**Where to Get**:
- **Sandbox**: Solution Provider Portal or Developer Console
- **Production**: Seller Central → Apps & Services → Develop Apps

**What You Need**:
1. **Client ID**: `amzn1.application-oa2-client.xxxxx` ✅ You have: `e4d916c08e1d400681fb8202e58afe9d`
2. **Client Secret**: `amzn1.oa2-cs.v1.xxxxx` ✅ You have: `7663287ec6cf44e614108afcf687b00dd8e21267bab513a3e34e2ef02c6f7652`
3. **Refresh Token**: `Atzr|xxxxx` ⚠️ **Still need** - Get via OAuth flow (see Troubleshooting section)
4. **Seller ID**: Starts with `A` ⚠️ **Try**: `A2V719MRGLK48O` (from your Account ID `amzn1.pa.o.A2V719MRGLK48O`)
5. **Marketplace ID**: `ATVPDKIKX0DER` (US)

**Getting Refresh Token**:
- **Sandbox**: Check "View sandbox credentials" in Solution Provider Portal, or complete OAuth flow
- **Production**: Complete OAuth authorization in Seller Central
- **OAuth URL** (if needed): `https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID&state=test123&version=beta`

### **B. AWS IAM Credentials** (For Message Center - Can Do Later)

**Where to Get**: AWS Console → IAM → Users

**What You Need**:
1. **Access Key ID**: Starts with `AKIA`
2. **Secret Access Key**: Long random string (save immediately - only shown once!)

**Steps**:
1. Go to: https://console.aws.amazon.com/iam/
2. Create IAM User: `little-hero-books-sp-api`
3. Attach policy: `AmazonSellingPartnerAPIReadOnly`
4. Save both keys immediately

---

## 🔧 **Part 2: Configure Environment Variables**

### **Update `back-end/.env.local`**

Add/update these sections:

```bash
# === Amazon SP-API Configuration ===
AMZ_APP_CLIENT_ID=YOUR_AMAZON_CLIENT_ID_HERE
AMZ_APP_CLIENT_SECRET=YOUR_AMAZON_CLIENT_SECRET_HERE
AMZ_REFRESH_TOKEN=Atzr|YOUR_REFRESH_TOKEN_HERE  # ⚠️ Get via OAuth
AMZ_SELLER_ID=A2V719MRGLK48O  # From your Account ID
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na

# === Sandbox Mode ===
AMAZON_SANDBOX_MODE=true  # Set to false for production

# === AWS IAM Credentials (for Message Center) ===
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID_HERE  # Can do later
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY_HERE  # Can do later
AWS_REGION=us-east-1

# === Customer Site Configuration ===
CUSTOMER_SITE_URL=https://littleherolabs.com
PREVIEW_AUTO_APPROVAL_HOURS=72
```

**Current Status**:
- ✅ Client ID - Set
- ✅ Client Secret - Set
- ✅ Seller ID - Set to `A2V719MRGLK48O`
- ⚠️ Refresh Token - Still need
- ⚠️ AWS IAM - Can do later (only for Message Center)

---

## 🔄 **Part 3: Set Up n8n Workflow 0**

### **Workflow Structure**

```
Manual Trigger
    ↓
Get Amazon Access Token (Code Node)
    ↓
Fetch Amazon Orders (Code Node)
    ↓
Fetch Order Items (Code Node) [Split by order]
    ↓
Parse Amazon Customization (Code Node)
    ↓
Normalize Payload (Existing Node)
```

### **Quick Setup**

1. **Open n8n** → Workflow 0: `LHB - 0 - ORDER INTAKE VALIDATION`
2. **Create 4 Code nodes** (see `AMAZON_N8N_CODE.md` for exact code)
3. **Connect them** in order above
4. **Disable "Mock Order" node** (keep for testing)
5. **Set up Cron Trigger**: `*/10 * * * *` (every 10 minutes)

**See `AMAZON_N8N_CODE.md` for complete code for all 4 nodes.**

---

## 📧 **Part 4: Amazon Message Center Setup**

### **Current Status**
✅ **Already Implemented**:
- Code: `back-end/src/lib/notifications/amazon-message-center.ts`
- API: `/api/notifications/preview/amazon`

### **What You Need**
- AWS IAM credentials (see Part 1B above)
- Add to `.env.local` (see Part 2 above)

### **How It Works**
1. Workflow 3 completes → Generates preview token
2. Call `/api/notifications/preview/amazon` with order ID and token
3. System sends preview link to customer via Amazon Message Center
4. Customer receives message in Amazon Message Center

**Can be set up later** - not required for basic order fetching.

---

## 🔄 **Switching Sandbox to Production**

When ready:
1. Get production credentials (same process, different portal)
2. Update `.env.local` with production values
3. Set `AMAZON_SANDBOX_MODE=false`
4. Restart services

**No code changes needed** - code automatically detects sandbox mode.

---

## ✅ **Quick Checklist**

- [ ] Client ID - ✅ Set
- [ ] Client Secret - ✅ Set
- [ ] Seller ID - ✅ Set to `A2V719MRGLK48O`
- [ ] Refresh Token - ⚠️ Get via OAuth (see Troubleshooting)
- [ ] Environment variables updated
- [ ] n8n workflow nodes created
- [ ] AWS IAM credentials (optional - for Message Center)

---

## 🆘 **Troubleshooting**

See `AMAZON_TROUBLESHOOTING.md` for:
- Getting Refresh Token (OAuth issues)
- Finding Solution Provider Portal
- Sandbox vs Production differences
- Common errors and solutions

---

## 📚 **Reference Documents**

- **n8n Code**: `AMAZON_N8N_CODE.md` - All code snippets for n8n nodes
- **Troubleshooting**: `AMAZON_TROUBLESHOOTING.md` - Common issues and solutions
- **Listing Spec**: `amazon-custom-listing-spec.md` - Amazon Custom field mapping
- **Pre-Launch**: `pre-launch-checklist.md` - Pre-launch tasks

---

**Next Step**: Get your Refresh Token, then set up n8n workflow using code from `AMAZON_N8N_CODE.md`! 🚀

