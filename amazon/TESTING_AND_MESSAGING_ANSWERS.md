# Testing, RDT, and Messaging API - Complete Answers

## 1. 🧪 Can We Place a "Test" Order?

### Answer: **No - Real Purchase Required for Production Testing**

**Key Findings:**
- ❌ Amazon SP-API does **NOT** provide a sandbox for order testing
- ✅ Sandbox exists for authentication/token testing only
- ✅ **Production API requires real orders** to test full order flow
- ⚠️ You must place an **actual purchase** to test production order processing

**What This Means:**
- Test with a **small, real order** (buy from yourself or a test account)
- Use the **lowest price** possible for your product
- Test in **production environment** (sandbox won't have real orders)
- Monitor the order through your entire workflow

**Testing Strategy:**
1. Place a real order on Amazon Custom (your own listing)
2. Use a test email/account you control
3. Manually trigger the cron job via Vercel dashboard
4. Verify order appears in Supabase and processes correctly
5. Cancel/refund the test order if needed (before printing)

---

## 2. 🔐 What is RDT? (Simple Explanation)

### **RDT = Restricted Data Token**

**In Simple Terms:**
- RDT is a **special permission slip** from Amazon
- It lets you access **private customer information** (PII)
- Without RDT: You can see order details, but NOT customer email/address/phone
- With RDT: You can see customer email, shipping address, phone number

**Why It Exists:**
- Protects customer privacy
- Only sellers who need it can get it
- Must be approved by Amazon

**What Data Requires RDT:**
- ✅ **Requires RDT:**
  - Customer email address
  - Customer name
  - Shipping address (full address)
  - Phone number
  - Tax information

- ✅ **No RDT Needed:**
  - Order ID
  - Order date
  - Product information
  - Customization data (child's name, age, etc.)
  - Order status

**How to Get RDT:**
1. Request **restricted roles** in your SP-API app
2. Amazon reviews and approves your request
3. Once approved, you can request RDT tokens
4. Use RDT token instead of regular access token for PII endpoints

**Current Status:**
- Check if your SP-API app has restricted roles approved
- If not, you'll need to request them from Amazon
- Until approved, you'll get 403 errors on buyer/address endpoints

---

## 3. 📧 Can We Send Approval Link via Email?

### **Answer: Two Options**

#### **Option A: Amazon Messaging API (Recommended)** ✅

**How It Works:**
- Send message through **Amazon Message Center**
- Customer receives **email notification** from Amazon
- Message appears in their Amazon account
- **Compliant with Amazon policies** ✅

**Pros:**
- ✅ Official Amazon channel
- ✅ Customer gets email notification
- ✅ Compliant with Amazon communication rules
- ✅ Messages logged in Amazon system
- ✅ Professional appearance

**Cons:**
- ⚠️ Must be order-related (approval is order-related ✅)
- ⚠️ Must respond to buyer messages within 24 hours
- ⚠️ Limited formatting options

#### **Option B: Direct Email (Not Recommended)** ❌

**Why Not Recommended:**
- ❌ Requires customer email (needs RDT)
- ❌ May violate Amazon's communication policies
- ❌ Customers may not trust non-Amazon emails
- ❌ No official tracking/logging

**If You Have Customer Email:**
- You could send direct email, but it's risky
- Amazon prefers all order-related communication through Message Center
- Could result in policy violations

**Recommendation:** Use Amazon Messaging API ✅

---

## 4. 🧪 Can We Test Amazon Messaging API?

### **Answer: Yes, But Limited**

**Testing Options:**

#### **Option 1: Sandbox Testing** (Limited)
- ✅ Can test API connectivity
- ✅ Can test authentication
- ❌ **Cannot send real messages** (sandbox doesn't deliver)
- ✅ Good for verifying code works

#### **Option 2: Production Testing** (Recommended)
- ✅ Send test message to **yourself** (place order, send message)
- ✅ Verify message appears in Amazon Message Center
- ✅ Check email notification is received
- ✅ Test with real order (small test purchase)

**Testing Steps:**
1. Place a small test order (yourself or test account)
2. Wait for order to be processed
3. Call messaging API endpoint with test message
4. Check Amazon Seller Central → Message Center
5. Verify customer received email notification
6. Test approval link works

---

## 5. ✅ Messaging API Implementation Status

### **Good News: Already Implemented!**

Developer B has already built a **complete Messaging API implementation**:

#### **What's Already Built:**

1. **Core Library** ✅
   - File: `back-end/src/lib/notifications/amazon-message-center.ts`
   - Complete TypeScript implementation
   - Handles authentication, document upload, message sending
   - Error handling and retry logic

2. **API Endpoint** ✅
   - File: `back-end/src/app/api/notifications/preview/amazon/route.ts`
   - Endpoint: `POST /api/notifications/preview/amazon`
   - Sends preview messages with approval links

3. **Features** ✅
   - HTML message templates
   - Document encryption and upload
   - AWS SigV4 request signing
   - Notification logging to Supabase
   - Support for reminders

#### **What You Need to Do:**

1. **Set Up AWS IAM Credentials** ⚠️
   - Create IAM user in AWS Console
   - Get Access Key ID + Secret Access Key
   - Add to environment variables

2. **Configure Environment Variables** ⚠️
   ```bash
   # AWS IAM (for SigV4 signing)
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=us-east-1
   
   # Amazon SP-API (production)
   AMZ_LWA_CLIENT_ID_PROD=your_prod_client_id
   AMZ_LWA_CLIENT_SECRET_PROD=your_prod_client_secret
   AMZ_LWA_REFRESH_TOKEN_PROD=your_prod_refresh_token
   ```

3. **Test the Endpoint** ⚠️
   - Place a test order
   - Call the API endpoint with order ID
   - Verify message is sent

#### **How to Use:**

```typescript
// In your workflow (W3 or W4), after book generation:

const response = await fetch('https://admin.littleherolabs.com/api/notifications/preview/amazon', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amazonOrderId: orderId,
    previewUrl: `https://admin.littleherolabs.com/approve/${orderId}?token=${token}`,
    childName: characterSpecs.childName,
    reminderType: 'initial', // or 'reminder'
  }),
});
```

#### **Documentation:**
- Full setup guide: `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`
- Status: `docs/amazon/AMAZON_MESSAGING_STATUS.md`

---

## 6. 📋 Summary & Next Steps

### **Testing Strategy:**

1. **Place Real Test Order** ✅
   - Small order (lowest price)
   - Use test account you control
   - Manually trigger cron job
   - Verify end-to-end flow

2. **Test Messaging API** ✅
   - Use existing implementation
   - Send test message to yourself
   - Verify email notification
   - Test approval link

3. **RDT Status** ⚠️
   - Check if restricted roles are approved
   - If not, request from Amazon
   - Until approved, phone/email may be missing

### **What's Ready:**
- ✅ Messaging API fully implemented
- ✅ Order processing flow ready
- ✅ W0 integration complete

### **What's Needed:**
- ⚠️ AWS IAM credentials for messaging
- ⚠️ Real test order for production testing
- ⚠️ RDT approval (if you need customer email/phone)

### **Recommended Order:**
1. Set up AWS IAM credentials
2. Place small test order
3. Test messaging API with real order
4. Verify approval link works
5. Request RDT if needed for phone numbers

---

## 7. 🔗 Quick Reference

**Messaging API Endpoint:**
- `POST /api/notifications/preview/amazon`
- Already implemented ✅

**Order Processing:**
- Cron: `/api/cron/amazon-orders`
- Manual trigger: Vercel dashboard

**Documentation:**
- Setup: `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`
- Status: `docs/amazon/AMAZON_MESSAGING_STATUS.md`
- Implementation: `back-end/src/lib/notifications/amazon-message-center.ts`









