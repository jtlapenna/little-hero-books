# Developer B - Amazon Integration Checklist

**Status**: Amazon seller approved ✅ - Ready to implement production integration

---

## 🎯 **Your Responsibilities**

As Developer B, you're responsible for:

1. ✅ **Amazon Messaging API** - Send customer preview links via Amazon Message Center
2. ✅ **n8n Workflow 0** - Fetch orders from Amazon SP-API
3. ✅ **End-to-End Testing** - Verify complete order flow works with real Amazon orders

---

## 📋 **Task 1: Amazon Messaging API Setup** ⚡ **PRIORITY**

### **Purpose**
Send customer preview links via Amazon Message Center when their book proof is ready.

### **Status**
- ✅ Code implemented: `back-end/src/lib/notifications/amazon-message-center.ts`
- ✅ API endpoint ready: `/api/notifications/preview/amazon`
- ⚠️ **Missing**: AWS IAM credentials

### **Action Items**

#### **1. Get AWS IAM Credentials**

**Where**: https://console.aws.amazon.com/iam/

**Steps**:
1. ✅ Create IAM user: `little-hero-labs-sp-api` (DONE)
2. ✅ Create custom policy: `LittleHeroLabsSpApiAccess` (DONE)
3. Attach policy to user
4. Generate access keys
5. Save credentials:
   - Access Key ID: `AKIA...`
   - Secret Access Key: (long string)

**Time**: 10 minutes

---

#### **2. Update Environment Variables**

**File**: `back-end/.env.local`

**Add**:
```bash
# === AWS IAM Credentials (for Message Center) ===
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
```

**Time**: 2 minutes

---

#### **3. Test the API**

**Command**:
```bash
curl -X POST https://admin.littleherolabs.com/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-ORDER-123",
    "token": "test-token",
    "reminderType": "initial"
  }'
```

**Expected**: Success response with `messageId` and `documentId`

**Time**: 5 minutes

---

#### **4. Add to Workflow 3**

**Where**: n8n → Workflow 3: `LHB - 3 - PNG Assembly`

**Action**: Add HTTP Request node after "Generate Preview Token"

**Configuration**:
- Method: `POST`
- URL: `https://admin.littleherolabs.com/api/notifications/preview/amazon`
- Body: `{ "orderId": "{{ $json.orderId }}", "token": "{{ $json.token }}", "reminderType": "initial" }`

**Time**: 10 minutes

---

### **Total Time**: ~30 minutes

### **Reference**: `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`

---

## 📋 **Task 2: n8n Workflow 0 Setup** (Amazon Order Fetching)

### **Purpose**
Automatically fetch orders from Amazon SP-API every 10 minutes.

### **Status**
- ✅ Code ready: `docs/amazon/AMAZON_N8N_CODE.md`
- ⚠️ **Needs**: Production Amazon SP-API credentials
- ⚠️ **Needs**: Implementation in n8n

### **Action Items**

#### **1. Get Production SP-API Credentials**

**Where**: Amazon Seller Central → Apps & Services → Develop Apps

**What You Need**:
1. Client ID: `amzn1.application-oa2-client.xxxxx`
2. Client Secret: `amzn1.oa2-cs.v1.xxxxx`
3. Refresh Token: `Atzr|xxxxx` (via OAuth)
4. Seller ID: `A...`
5. Marketplace ID: `ATVPDKIKX0DER`

**Time**: 15-30 minutes (depending on OAuth flow)

---

#### **2. Update CONFIG Node**

**Where**: n8n → Workflow 0 → CONFIG (PRODUCTION) node

**Add**:
```javascript
amazon: {
  clientId: "YOUR_PRODUCTION_CLIENT_ID",
  clientSecret: "YOUR_PRODUCTION_CLIENT_SECRET",
  refreshToken: "Atzr|YOUR_PRODUCTION_REFRESH_TOKEN",
  sellerId: "YOUR_SELLER_ID",
  marketplaceId: "ATVPDKIKX0DER",
  region: "na",
  sandboxMode: false  // ← Set to false for production
}
```

**Time**: 5 minutes

---

#### **3. Create 4 Amazon Nodes**

**Where**: n8n → Workflow 0

**Nodes to Create**:
1. **Get Amazon Access Token** (Code node)
2. **Fetch Amazon Orders** (Code node)
3. **Fetch Order Items** (Code node)
4. **Parse Amazon Customization** (Code node)

**Code**: See `docs/amazon/AMAZON_N8N_CODE.md` for exact code

**Time**: 20 minutes

---

#### **4. Connect Nodes**

**Flow**:
```
CONFIG (PRODUCTION)
    ↓
Get Amazon Access Token
    ↓
Fetch Amazon Orders
    ↓
Fetch Order Items
    ↓
Parse Amazon Customization
    ↓
Normalize Payload (existing)
```

**Time**: 5 minutes

---

#### **5. Set Up Cron Trigger**

**Replace**: Manual Trigger with Cron Trigger

**Cron Expression**: `*/10 * * * *` (every 10 minutes)

**Time**: 2 minutes

---

#### **6. Test**

**Action**: Run workflow manually, verify orders are fetched and parsed

**Time**: 10 minutes

---

### **Total Time**: ~1 hour

### **Reference**: `docs/amazon/SETUP_AND_TEST.md`

---

## 📋 **Task 3: End-to-End Testing**

### **Purpose**
Verify complete order flow works with real Amazon orders.

### **Prerequisites**
- ✅ Task 1 complete (Amazon Messaging API)
- ✅ Task 2 complete (n8n Workflow 0)
- ✅ Amazon Custom listing created (with product images)

### **Test Plan**

#### **1. Place Test Order**

**Where**: Your Amazon Custom listing

**Action**: Place an order with test character specs

**Time**: 5 minutes

---

#### **2. Monitor Workflow 0**

**Check**:
- Order appears in n8n within 10 minutes
- Order stored in Supabase `orders` table
- Character specs parsed correctly

**Time**: 15 minutes

---

#### **3. Monitor Workflows 2A → 2B → 3**

**Check**:
- Character generation completes (2A)
- Background removal completes (2B)
- PDF generation completes (3)
- Preview token generated

**Time**: 30-60 minutes (depending on AI processing)

---

#### **4. Verify Amazon Message**

**Check**:
- Message sent via Amazon Message Center
- Message appears in Amazon Seller Central
- Preview link works
- Approval page loads correctly

**Time**: 5 minutes

---

#### **5. Test Customer Approval**

**Action**: Click preview link, submit approval

**Check**:
- Approval recorded in Supabase
- Workflow 4 triggered
- Order submitted to Lulu

**Time**: 5 minutes

---

#### **6. Monitor Workflow 4**

**Check**:
- Order submitted to Lulu
- `lulu_job_id` stored in database
- Lulu webhook updates status
- Shipment confirmed back to Amazon

**Time**: 2-5 days (actual printing time)

---

#### **7. Verify Physical Book**

**Check**:
- Book arrives at shipping address
- Quality matches expectations
- Personalization correct
- Print quality acceptable

**Time**: 5-7 days (shipping time)

---

### **Total Time**: ~1 hour active testing + 7-10 days waiting

### **Reference**: `docs/amazon/AMAZON_SELLER_APPROVED_NEXT_STEPS.md`

---

## 🚨 **Blockers**

### **Cannot Proceed Without**:

1. ⚠️ **AWS IAM Credentials**
   - Needed for: Amazon Messaging API
   - Get from: AWS Console (IAM)
   - Time: 10 minutes

2. ⚠️ **Production SP-API Credentials**
   - Needed for: n8n Workflow 0
   - Get from: Amazon Seller Central
   - Time: 15-30 minutes

3. ⚠️ **Product Images** (7 images)
   - Needed for: Amazon Custom listing
   - Get from: Photography or design
   - Time: 1-2 days (if ordering samples + photography)

---

## ✅ **Quick Start (30 Minutes)**

If you want to get started immediately:

### **Step 1: Get AWS IAM Credentials** (10 min)
1. Go to AWS Console
2. Create IAM user
3. Save credentials

### **Step 2: Update Environment Variables** (2 min)
1. Add AWS credentials to `back-end/.env.local`
2. Restart Next.js server

### **Step 3: Test Amazon Messaging API** (5 min)
1. Run curl command
2. Verify success response

### **Step 4: Add to Workflow 3** (10 min)
1. Open n8n
2. Add HTTP Request node
3. Test with manual trigger

### **Done!** ✅
Amazon Messaging API is now operational. You can test customer preview delivery without needing Amazon orders yet.

---

## 📊 **Progress Tracking**

### **Task 1: Amazon Messaging API** ✅ **COMPLETE**
- [x] AWS IAM credentials obtained
- [x] Environment variables updated
- [x] API tested successfully
- [ ] HTTP Request node added to Workflow 3 (Developer A's task)
- [ ] End-to-end test completed (waiting on Amazon listing)

### **Task 2: n8n Workflow 0**
- [ ] Production SP-API credentials obtained
- [ ] CONFIG node updated
- [ ] 4 Amazon nodes created
- [ ] Nodes connected correctly
- [ ] Cron trigger set up
- [ ] Test order fetched successfully

### **Task 3: End-to-End Testing**
- [ ] Test order placed
- [ ] Order fetched by Workflow 0
- [ ] Workflows 2A → 2B → 3 completed
- [ ] Amazon message sent
- [ ] Customer approval tested
- [ ] Workflow 4 completed
- [ ] Physical book received and verified

---

## 📚 **Reference Documents**

### **Setup Guides**:
- `AMAZON_SELLER_APPROVED_NEXT_STEPS.md` - Complete overview
- `AMAZON_MESSAGING_API_SETUP.md` - Messaging API setup
- `AMAZON_SETUP_GUIDE.md` - Complete Amazon setup
- `SETUP_AND_TEST.md` - n8n workflow setup

### **Code References**:
- `AMAZON_N8N_CODE.md` - All n8n node code
- `back-end/src/lib/notifications/amazon-message-center.ts` - Messaging implementation
- `back-end/src/app/api/notifications/preview/amazon/route.ts` - API endpoint

### **Troubleshooting**:
- `AMAZON_TROUBLESHOOTING.md` - Common issues and solutions

---

## 🎊 **Summary**

### **What's Ready**:
- ✅ Amazon Messaging API code complete
- ✅ n8n Workflow 0 code complete
- ✅ All documentation complete
- ✅ Testing plan defined

### **What You Need**:
- ⚠️ AWS IAM credentials (10 minutes)
- ⚠️ Production SP-API credentials (30 minutes)
- ⚠️ Product images (1-2 days)

### **Time to Complete**:
- **Quick Start** (Messaging API only): 30 minutes
- **Full Setup** (Messaging + Workflow 0): 2 hours
- **End-to-End Test**: 7-10 days (including printing/shipping)

---

**You're ready to start! Begin with Task 1 (Amazon Messaging API) - it's the quickest win and unblocks customer preview delivery.** 🚀

