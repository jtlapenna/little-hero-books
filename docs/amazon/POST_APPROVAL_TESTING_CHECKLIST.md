# Post-Approval Testing Checklist

**Status**: ✅ **LISTING APPROVED** - Ready for Testing  
**Date Created**: December 2, 2025  
**Date Updated**: December 5, 2025  
**Listing Status**: ✅ Approved (Deactivated for Testing)

---

## 🎊 **CONGRATULATIONS! Your Amazon Listing is Approved!**

Your first book has been approved by Amazon. The listing is currently **deactivated** while you perfect the workflow process. This is the right approach - test everything thoroughly before going live.

---

## 🎯 **Your Testing Goals**

You want to accomplish the following before reactivating the listing:

1. **Submit an order from Amazon** (or simulate as close to real as possible)
2. **Send order through entire n8n workflow** (Workflows 0 → 1 → 2A → 2B → 3 → 4)
3. **Test Amazon Messaging API** to send preview URL to customer
4. **Complete workflow to Lulu API** and cancel before actual print

**Goal**: Perfect the end-to-end process so when you reactivate, it's a 1:1 production-ready flow.

---

## 📋 **Current System Analysis**

### **What's Already Working** ✅

**Amazon Integration**:
- ✅ Production SP-API credentials configured
- ✅ Amazon Messaging API implemented and tested
- ✅ `AMAZON_SANDBOX_MODE=false` (production mode)
- ✅ Workflow 0 ready to fetch orders from Amazon

**Workflows**:
- ✅ Workflow 0: Order Intake & Validation (mock order generator ready)
- ✅ Workflow 1: Queue Manager & Router
- ✅ Workflows 2A, 2B, 3: Character generation & PDF assembly
- ✅ Workflow 4: Print & Fulfillment (Lulu integration)

**Database**:
- ✅ Supabase fully operational
- ✅ All tables and fields ready
- ✅ Preview token system operational

**Customer Preview System**:
- ✅ Preview page live at `https://admin.littleherolabs.com/approve/[token]`
- ✅ Amazon Message Center integration ready
- ✅ Customer approval/correction flow operational

### **What Needs Testing** 🧪

1. **Real Amazon order submission** (or high-fidelity simulation)
2. **Complete workflow execution** (0 → 1 → 2A → 2B → 3 → 4)
3. **Amazon Messaging API** sending preview links
4. **Customer preview approval flow**
5. **Lulu API submission** (with cancellation before print)

---

## 🎯 **Immediate Actions After Approval**

### **Phase 1: Initial Verification (5 minutes)**

Once you receive the approval email from Amazon:

- [ ] **Verify listing is live**
  - Go to Amazon and search for your product
  - Confirm it appears in search results
  - Verify all 7 images are displaying correctly
  - Check that customization fields are working

- [ ] **Test the order form**
  - Click "Customize" or "Personalize"
  - Fill in all 10 customization fields
  - Verify dropdown options are correct
  - DO NOT complete the purchase yet

- [ ] **Screenshot everything**
  - Take screenshots of the live listing
  - Screenshot the customization form
  - Save for documentation

---

## 🚀 **PHASE 1: Simulated Order Testing (TODAY)**

**Goal**: Test complete workflow with mock order that mimics real Amazon order structure

**Cost**: $0 (no real orders, no print costs)

**Why Start Here**: Your listing is deactivated, so we'll use Workflow 0's mock order generator to simulate a real Amazon order. This lets us test the entire system without placing real orders.

---

### **Step 1: Prepare Mock Order in Workflow 0** (5 minutes)

**Action**: Update the mock order generator to match your real Amazon listing structure

**File**: `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json`

**Current Mock Order** (lines 17-18):
```javascript
const TEST_CONFIG = {
  orderId: "hair-test-02",
  childName: "Gio",
  childAge: 5,
  skinTone: "brown-light",
  hairColor: "light-brown",
  hairStyle: "curly-crop",
  pronouns: "he/him",
  favoriteColor: "green",
  animalGuide: "t-rex",
  clothingStyle: "tee-shorts",
  customerEmail: "test@littleherolabs.com",
  shippingName: "Jane Smith",
  shippingAddress: "123 Main Street",
  shippingCity: "Portland",
  shippingState: "OR",
  shippingZip: "97201",
  shippingPhone: "+1-555-123-4567"
};
```

**What to Update**:
1. Change `orderId` to something like `"AMAZON-TEST-001"`
2. Update `customerEmail` to your real Amazon buyer email (so you receive the Amazon Message)
3. Update shipping details to your real address (for Lulu API testing)
4. Verify all customization fields match your Amazon listing dropdowns

**Verification Checklist**:
- [ ] Order ID is unique and identifiable
- [ ] Customer email is YOUR email (you'll receive Amazon Message)
- [ ] Character specs match your Amazon listing options exactly
- [ ] Shipping address is complete (required for Lulu API)
- [ ] Phone number is included (required for Lulu API)

---

### **Step 2: Test Workflow 0 → Database** (10 minutes)

**Action**: Run Workflow 0 manually and verify order reaches database

**Steps**:
1. **Open n8n** → Navigate to "WORKING VERSION - 0 - Order Intake & Validation"
2. **Click "Execute Workflow"** (manual trigger)
3. **Watch execution** - Should complete in ~5 seconds
4. **Check Supabase** - Verify order appears in `orders` table

**SQL Query to Verify**:
```sql
SELECT 
  amazon_order_id,
  status,
  execution_status,
  next_workflow,
  character_specs,
  customer_email,
  one_manifest_url,
  created_at
FROM orders
WHERE amazon_order_id = 'AMAZON-TEST-001'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results**:
- ✅ Order exists in database
- ✅ `status = 'new'`
- ✅ `execution_status = 'ready_for_processing'`
- ✅ `next_workflow = '2A'`
- ✅ `character_specs` populated with your test data
- ✅ `one_manifest_url` contains R2 path to manifest

**Troubleshooting**:
- ❌ **Workflow fails**: Check CONFIG node has correct Supabase credentials
- ❌ **No database record**: Check "Supabase: upsert order" node logs
- ❌ **Missing fields**: Verify mock order has all required fields

---

### **Step 3: Test Workflow 1 → Queue Router** (5 minutes)

**Action**: Verify Workflow 1 picks up the order and routes it to Workflow 2A

**Steps**:
1. **Open n8n** → Navigate to "LHB - 1.1- Queue Manager and Router"
2. **Check if it's running** (should have cron trigger)
3. **If not running, execute manually**
4. **Check database** - Order should be updated

**SQL Query to Verify**:
```sql
SELECT 
  amazon_order_id,
  status,
  execution_status,
  next_workflow,
  queued_at,
  updated_at
FROM orders
WHERE amazon_order_id = 'AMAZON-TEST-001';
```

**Expected Results**:
- ✅ `status = 'queued_for_processing'` (updated by router)
- ✅ `queued_at` timestamp set
- ✅ `next_workflow = '2A'` (ready for character generation)

---

### **Step 4: Test Workflows 2A → 2B → 3** (30-60 minutes)

**Action**: Run character generation and PDF assembly workflows

**⚠️ IMPORTANT**: These workflows may require human review stages. Check your workflow configuration.

**Steps**:
1. **Run Workflow 2A** (Character Generation)
   - Execute "SW0 - Base Character Generation"
   - Execute "SW1 - Pose Generation"
   - Execute "SW2 - Pose and Style QA"
   - Execute "SW3 - Upload"
   - **Time**: ~15-20 minutes (AI generation)

2. **Check Human Review** (if enabled)
   - Go to `https://admin.littleherolabs.com/review`
   - Approve Pre-Bria stage if required

3. **Run Workflow 2B** (Background Removal)
   - Execute "LHB - 2.B. - Background Removal"
   - **Time**: ~10-15 minutes

4. **Check Human Review** (if enabled)
   - Approve Post-Bria stage if required

5. **Run Workflow 3** (PDF Assembly)
   - Execute "LHB - 3 -PNG Assembly"
   - **Time**: ~5-10 minutes

6. **Check Human Review** (if enabled)
   - Approve Post-PDF stage if required

**SQL Query to Monitor Progress**:
```sql
SELECT 
  amazon_order_id,
  status,
  execution_status,
  next_workflow,
  character_hash,
  manifest_2a_url,
  manifest_2b_url,
  manifest_3_url,
  final_book_url,
  updated_at
FROM orders
WHERE amazon_order_id = 'AMAZON-TEST-001';
```

**Expected Results After Workflow 3**:
- ✅ `status = 'pdf_generated'` or `'post_pdf_approved'`
- ✅ `manifest_3_url` contains path to final manifest
- ✅ `final_book_url` contains path to generated PDF
- ✅ PDF is viewable in admin panel

---

### **Step 5: Test Amazon Messaging API** (10 minutes)

**Action**: Send preview link to customer via Amazon Message Center

**⚠️ CRITICAL**: This is where you test the Amazon Messaging API integration!

**Prerequisites**:
- ✅ Workflow 3 complete (PDF generated)
- ✅ Preview token generated
- ✅ Order has `customer_email` set to YOUR email

**Option A: Manual API Test** (Recommended First)
```bash
cd /Users/johncapogna/Sites/little-hero-books/back-end

# Test the API endpoint directly
curl -X POST http://localhost:3000/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "AMAZON-TEST-001",
    "token": "YOUR_PREVIEW_TOKEN_HERE",
    "reminderType": "initial"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "orderId": "AMAZON-TEST-001",
  "messageId": "amzn-msg-12345...",
  "status": "sent"
}
```

**Option B: Add to Workflow 3** (Production Setup)

**Steps**:
1. **Open n8n** → Workflow 3: "LHB - 3 -PNG Assembly"
2. **Find the node** that generates preview token
3. **Add HTTP Request node** after it:
   - **Name**: `Send Amazon Preview Message`
   - **Method**: `POST`
   - **URL**: `https://admin.littleherolabs.com/api/notifications/preview/amazon`
   - **Body**: JSON
   ```json
   {
     "orderId": "{{ $json.orderId }}",
     "token": "{{ $json.previewToken }}",
     "reminderType": "initial"
   }
   ```
4. **Save and re-execute Workflow 3**

**Verification**:
- [ ] Check your Amazon account's Message Center
- [ ] Look for message from "Little Hero Labs"
- [ ] Message should contain preview URL
- [ ] Click URL and verify preview page loads
- [ ] Verify PDF displays correctly
- [ ] Test approval/correction form

**SQL Query to Check Notification Logs**:
```sql
SELECT 
  order_id,
  notification_type,
  status,
  message_id,
  error_message,
  created_at
FROM notification_logs
WHERE order_id = (SELECT id FROM orders WHERE amazon_order_id = 'AMAZON-TEST-001')
ORDER BY created_at DESC;
```

---

### **Step 6: Test Customer Preview Approval** (5 minutes)

**Action**: Approve the order through the customer preview page

**Steps**:
1. **Open preview link** from Amazon Message
2. **Review the PDF** - Check character, story, quality
3. **Click "Approve"** button
4. **Verify database update**

**SQL Query to Verify Approval**:
```sql
SELECT 
  amazon_order_id,
  status,
  customer_approval_status,
  customer_approval_approved_at,
  next_workflow
FROM orders
WHERE amazon_order_id = 'AMAZON-TEST-001';
```

**Expected Results**:
- ✅ `customer_approval_status = 'approved'`
- ✅ `customer_approval_approved_at` timestamp set
- ✅ `next_workflow = '4'` (ready for print)

---

### **Step 7: Test Workflow 4 → Lulu API (CANCEL BEFORE PRINT)** (15 minutes)

**Action**: Submit order to Lulu API and immediately cancel

**⚠️ CRITICAL**: We want to test Lulu API integration WITHOUT actually printing the book.

**Steps**:

1. **Verify Lulu API Credentials**
   - Open Workflow 4: "LHB - 4 - PRINT FULlFILMENT"
   - Check CONFIG node has Lulu API credentials
   - Verify `LULU_SANDBOX_MODE` setting (if available)

2. **Execute Workflow 4**
   - Click "Execute Workflow"
   - Watch for Lulu API submission
   - **IMMEDIATELY** proceed to step 3

3. **Check Database for Lulu Job ID**
```sql
SELECT 
  amazon_order_id,
  status,
  lulu_job_id,
  lulu_status,
  lulu_submitted_at
FROM orders
WHERE amazon_order_id = 'AMAZON-TEST-001';
```

4. **Cancel Order in Lulu Dashboard** (IMMEDIATELY)
   - Go to Lulu Print API dashboard
   - Find job with `lulu_job_id` from database
   - **CANCEL THE JOB** before it goes to production
   - **Cost if cancelled in time**: $0
   - **Cost if not cancelled**: ~$8-12 (book print cost)

**Expected Results**:
- ✅ `lulu_job_id` stored in database
- ✅ `lulu_status = 'CREATED'` or `'PENDING'`
- ✅ `lulu_submitted_at` timestamp set
- ✅ Job cancelled in Lulu dashboard (no print cost)

**Alternative: Use Lulu Sandbox** (if available)
- Check if Lulu offers a sandbox/test environment
- Update Workflow 4 CONFIG to use sandbox credentials
- No need to cancel - sandbox orders don't print

---

### **Step 8: Verify Lulu Webhook Integration** (Optional)

**Action**: Test that Lulu webhooks update order status automatically

**Prerequisites**:
- ✅ Lulu webhook subscribed (see Developer A tasks)
- ✅ Webhook endpoint deployed at `https://admin.littleherolabs.com/api/webhooks/lulu/status`

**Steps**:
1. **After cancelling Lulu job**, wait 1-2 minutes
2. **Check database** for status update

**SQL Query**:
```sql
SELECT 
  amazon_order_id,
  lulu_status,
  updated_at
FROM orders
WHERE amazon_order_id = 'AMAZON-TEST-001';
```

**Expected Results**:
- ✅ `lulu_status` updated to `'CANCELLED'` (if webhook working)
- ✅ `updated_at` timestamp reflects webhook update

**If webhook not working**:
- Status will remain `'CREATED'` or `'PENDING'`
- This is OK for now - webhook setup is Developer A's task
- You can manually update the status for testing

---

## ✅ **Phase 1 Success Criteria**

After completing all steps above, you should have:

- [x] Mock order successfully processed through Workflow 0
- [x] Order stored in Supabase with all fields
- [x] Workflow 1 routed order to Workflow 2A
- [x] Workflows 2A → 2B → 3 generated character and PDF
- [x] Amazon Messaging API sent preview link
- [x] Preview link received in Amazon Message Center
- [x] Customer preview page loaded and worked
- [x] Order approved through preview page
- [x] Workflow 4 submitted to Lulu API
- [x] Lulu job ID stored in database
- [x] Lulu job cancelled (no print cost)

**Result**: You've tested the ENTIRE end-to-end flow without spending money on prints!

---

## 🧪 **PHASE 2: Real Amazon Order Testing (NEXT)**

**Goal**: Test with actual Amazon order (listing temporarily reactivated)

**Cost**: $0 (order cancelled before fulfillment)

**When to do this**: After Phase 1 is successful and you're confident in the workflow

### **Prerequisites for Phase 2**

Before placing a real Amazon order:

- [ ] **Phase 1 complete** - Mock order tested successfully
- [ ] **All workflows verified** - No errors in execution
- [ ] **Amazon Messaging API working** - Received test message
- [ ] **Lulu API tested** - Job submitted and cancelled successfully
- [ ] **Confidence level: HIGH** - Ready to test with real Amazon order

---

### **Step 1: Temporarily Reactivate Listing** (2 minutes)

**Action**: Make listing active just long enough to place test order

**Steps**:
1. **Log into Amazon Seller Central**
2. **Navigate to**: Inventory → Manage Inventory
3. **Find your listing**: "Little Hero Labs" personalized book
4. **Change status**: Inactive → **Active**
5. **Wait 5 minutes** for Amazon to process
6. **Verify listing is live**: Search for it on Amazon.com

**⚠️ IMPORTANT**: You'll deactivate it again after placing your test order.

---

### **Step 2: Place Real Test Order** (10 minutes)

**Action**: Purchase your own book through Amazon

**Steps**:
1. **Open Amazon.com** in incognito/private browser
2. **Search for your listing** (or use direct link)
3. **Click "Customize"**
4. **Fill in test character specs**:
   - Name: "TestKid1"
   - Age: 5
   - Pronouns: they/them
   - Skin: medium
   - Hair: brown/curly
   - Favorite Color: purple
   - Animal: unicorn
   - Clothing Style: casual
   - Hometown: Portland
   - Dedication: "For our little adventurer!"

5. **Add to cart**
6. **Proceed to checkout**
7. **Use YOUR address** (so you can cancel easily)
8. **Complete purchase**
9. **IMMEDIATELY note the Amazon Order ID** (from confirmation page)
10. **Screenshot everything** (for documentation)

**Cost**: $27.99 + tax (will be refunded when you cancel)

---

### **Step 3: Deactivate Listing Again** (2 minutes)

**Action**: Immediately deactivate listing after placing order

**Steps**:
1. **Return to Seller Central**
2. **Navigate to**: Inventory → Manage Inventory
3. **Find your listing**
4. **Change status**: Active → **Inactive**

**Why**: Prevents real customers from ordering while you're testing.

---

### **Step 4: Monitor Workflow 0 (Order Intake)** (10-15 minutes)

**Action**: Wait for Workflow 0 to fetch the order from Amazon

**⚠️ IMPORTANT**: Workflow 0 needs to be configured to fetch REAL Amazon orders, not just mock orders.

**Check Workflow 0 Configuration**:
1. **Open n8n** → "WORKING VERSION - 0 - Order Intake & Validation"
2. **Check trigger**: Should have cron trigger (every 10 minutes) OR Amazon webhook
3. **Verify it's not using mock order generator** for production

**If Workflow 0 is still using mock orders**:
- You need to configure Amazon SP-API order fetching
- See `docs/amazon/AMAZON_SETUP_GUIDE.md` for SP-API integration
- This may require Developer A to update Workflow 0

**Monitor Database**:
```sql
-- Check if order was fetched
SELECT 
  amazon_order_id,
  status,
  execution_status,
  character_specs,
  customer_email,
  created_at
FROM orders
WHERE amazon_order_id LIKE '%YOUR_REAL_ORDER_ID%'
ORDER BY created_at DESC;
```

**Expected Timeline**:
- **0-10 minutes**: Workflow 0 cron runs and fetches order
- **10-15 minutes**: Order appears in database

**Troubleshooting**:
- ❌ **Order not fetched after 15 minutes**: Check Workflow 0 is running
- ❌ **SP-API errors**: Verify production credentials in `.env.local`
- ❌ **Order appears but missing fields**: Check character spec extraction logic

---

### **Step 5: Monitor Complete Workflow** (60-90 minutes)

**Action**: Watch order flow through all workflows automatically

**Timeline**:
- **0-15 min**: Workflow 0 fetches order
- **15-20 min**: Workflow 1 routes to 2A
- **20-40 min**: Workflow 2A generates character
- **40-55 min**: Workflow 2B removes backgrounds
- **55-70 min**: Workflow 3 assembles PDF
- **70-75 min**: Amazon Message sent with preview link
- **75-90 min**: Waiting for your approval

**Monitor Progress**:
```sql
-- Real-time status check
SELECT 
  amazon_order_id,
  status,
  execution_status,
  next_workflow,
  character_hash,
  final_book_url,
  customer_approval_status,
  lulu_job_id,
  updated_at
FROM orders
WHERE amazon_order_id LIKE '%YOUR_REAL_ORDER_ID%';
```

**Check n8n Execution Logs**:
- Go to n8n dashboard
- View "Executions" tab
- Look for your order ID in recent executions
- Check for any errors or warnings

---

### **Step 6: Receive and Test Amazon Message** (5 minutes)

**Action**: Check your Amazon account for the preview message

**Steps**:
1. **Log into Amazon.com**
2. **Go to**: Your Account → Message Center
3. **Look for message** from "Little Hero Labs" or seller name
4. **Verify message content**:
   - Contains preview URL
   - URL is properly formatted
   - Message is professional and clear
5. **Click the preview URL**
6. **Verify preview page loads**:
   - Shows correct order
   - PDF displays correctly
   - Character matches your specs
   - Story text is correct

**If message not received**:
- Check `notification_logs` table for errors
- Verify Amazon Messaging API credentials
- Check backend logs for API errors

---

### **Step 7: Approve Order (or Test Corrections)** (5 minutes)

**Action**: Test the customer approval flow

**Option A: Approve Order**
1. **Click "Approve" button** on preview page
2. **Verify database update**:
```sql
SELECT 
  amazon_order_id,
  customer_approval_status,
  customer_approval_approved_at,
  next_workflow
FROM orders
WHERE amazon_order_id LIKE '%YOUR_REAL_ORDER_ID%';
```
3. **Expected**: `customer_approval_status = 'approved'`, `next_workflow = '4'`

**Option B: Test Correction Flow** (Optional)
1. **Click "Request Changes"** button
2. **Fill in correction form**:
   - Reason: "Hair color adjustment"
   - Preferred hair color: "darker brown"
   - Email: your email
3. **Submit correction**
4. **Verify database**:
```sql
SELECT 
  order_id,
  correction_reason,
  correction_details,
  customer_email,
  created_at
FROM customer_feedback
WHERE order_id = (SELECT id FROM orders WHERE amazon_order_id LIKE '%YOUR_REAL_ORDER_ID%');
```

---

### **Step 8: Cancel Order BEFORE Lulu Submission** (CRITICAL)

**Action**: Cancel the Amazon order to avoid print costs

**⚠️ CRITICAL TIMING**: You must cancel BEFORE Workflow 4 submits to Lulu!

**Steps**:

1. **Monitor database** for Workflow 4 trigger:
```sql
-- Check if order is ready for print
SELECT 
  amazon_order_id,
  status,
  next_workflow,
  customer_approval_approved_at,
  lulu_job_id
FROM orders
WHERE amazon_order_id LIKE '%YOUR_REAL_ORDER_ID%';
```

2. **If `next_workflow = '4'` and `lulu_job_id IS NULL`**:
   - **IMMEDIATELY cancel the Amazon order**
   - Go to Amazon.com → Your Orders
   - Find the order
   - Click "Cancel Order"
   - Select reason: "Ordered by mistake"

3. **If `lulu_job_id` is already set**:
   - **TOO LATE** - Order already submitted to Lulu
   - Go to Lulu dashboard and cancel there
   - **Cost**: ~$8-12 (book print cost)

**Best Practice**: 
- Set up a manual approval step before Workflow 4
- Or: Temporarily disable Workflow 4 auto-trigger
- Or: Monitor closely and cancel within 5 minutes of approval

---

### **Step 9: Verify Cancellation** (5 minutes)

**Action**: Confirm order is cancelled in all systems

**Check Amazon**:
- [ ] Order status shows "Cancelled" on Amazon.com
- [ ] Refund processed (may take 3-5 days)

**Check Database**:
```sql
UPDATE orders
SET status = 'cancelled',
    execution_status = 'cancelled_for_testing',
    updated_at = NOW()
WHERE amazon_order_id LIKE '%YOUR_REAL_ORDER_ID%';
```

**Check Lulu** (if submitted):
- [ ] Job cancelled in Lulu dashboard
- [ ] No print charges incurred

## ✅ **Phase 2 Success Criteria**

After completing Phase 2, you should have:

- [x] Real Amazon order placed successfully
- [x] Order fetched by Workflow 0 from Amazon SP-API
- [x] Complete workflow execution (0 → 1 → 2A → 2B → 3)
- [x] Amazon Message received with preview link
- [x] Preview page worked with real order
- [x] Customer approval flow tested
- [x] Order cancelled before Lulu print (no cost)

**Result**: You've validated the REAL Amazon integration end-to-end!

---

## 🎯 **PHASE 3: Full End-to-End Test (OPTIONAL - $30 cost)**

**Goal**: Test complete flow including actual Lulu print

**Cost**: ~$30 (book print + shipping)

**When to do this**: Only after Phases 1 and 2 are successful

**Why**: Validates physical book quality and complete fulfillment

### **Step 1: Place Final Test Order**

**Action**: Place one more real Amazon order, but DON'T cancel it

**Steps**:
1. **Temporarily reactivate listing**
2. **Place order** with your favorite character specs
3. **Deactivate listing again**
4. **Let it run through complete workflow**
5. **Approve the preview** when you receive Amazon Message
6. **Let Workflow 4 submit to Lulu** (don't cancel!)

---

### **Step 2: Monitor Lulu Production** (7-10 days)

**Action**: Watch order progress through Lulu's print process

**Monitor Database**:
```sql
SELECT 
  amazon_order_id,
  lulu_status,
  lulu_job_id,
  tracking_number,
  carrier,
  updated_at
FROM orders
WHERE amazon_order_id LIKE '%YOUR_FINAL_ORDER_ID%';
```

**Expected Status Progression**:
1. `CREATED` - Job submitted to Lulu
2. `IN_PRODUCTION` - Book being printed
3. `SHIPPED` - Book shipped (tracking number available)
4. `DELIVERED` - Book delivered (if Lulu provides this status)

**Timeline**:
- **Day 0**: Order submitted to Lulu
- **Day 1-3**: In production
- **Day 3-4**: Shipped
- **Day 7-10**: Delivered

---

### **Step 3: Receive and Inspect Physical Book** (Day 7-10)

**Action**: Quality check the physical book

**Inspection Checklist**:
- [ ] **Character appearance**: Matches your specs
- [ ] **Character consistency**: Same across all 12 poses
- [ ] **Story text**: Correct, readable, no typos
- [ ] **Child's name**: Appears naturally throughout
- [ ] **Colors**: Accurate and vibrant
- [ ] **Print quality**: Sharp, no blurriness
- [ ] **Binding**: Secure, pages don't fall out
- [ ] **Cover**: Professional, no damage
- [ ] **Size**: 8.5×8.5 inches as specified
- [ ] **Page count**: 16 pages (14 interior + covers)

**Take Photos**:
- Cover
- 3-4 interior spreads
- Character close-ups
- Any issues or defects

**Document Results**:
- Create a quality report
- Note any improvements needed
- Share photos with team
- Update product listing if needed

---

## ✅ **Phase 3 Success Criteria**

After receiving the physical book:

- [x] Book received within 7-10 days
- [x] Print quality meets standards
- [x] Character looks correct
- [x] Story text is accurate
- [x] Binding is secure
- [x] Overall quality acceptable for customers

**Result**: You've validated the COMPLETE end-to-end process including physical fulfillment!

---

## 🚀 **YOUR IMMEDIATE ACTION PLAN**

Based on your requirements, here's exactly what to do TODAY:

### **🎯 Goal**: Test complete workflow with mock order, then move to real orders

---

### **TODAY: Phase 1 - Mock Order Testing**

**Time Required**: 2-3 hours

**Steps**:
1. ✅ **Update mock order in Workflow 0** (5 min)
   - Set your email as `customerEmail`
   - Use realistic character specs
   - Verify shipping address is complete

2. ✅ **Run Workflow 0 manually** (5 min)
   - Execute in n8n
   - Verify order in Supabase

3. ✅ **Run Workflows 1 → 2A → 2B → 3** (60-90 min)
   - Let workflows execute
   - Approve human review stages if needed
   - Verify PDF generation

4. ✅ **Test Amazon Messaging API** (10 min)
   - Call API endpoint manually OR
   - Add HTTP Request node to Workflow 3
   - Check Amazon Message Center for message
   - Click preview link and test

5. ✅ **Approve order** (5 min)
   - Use preview page to approve
   - Verify database update

6. ✅ **Test Lulu API submission** (15 min)
   - Run Workflow 4
   - Verify `lulu_job_id` stored
   - **IMMEDIATELY cancel in Lulu dashboard**

**Cost**: $0 (if you cancel Lulu job in time)

---

### **NEXT: Phase 2 - Real Amazon Order**

**Time Required**: 2-3 hours (plus monitoring time)

**Prerequisites**:
- ✅ Phase 1 successful
- ✅ Workflow 0 configured for real Amazon orders (see note below)

**Steps**:
1. ✅ **Temporarily reactivate listing** (2 min)
2. ✅ **Place real test order** (10 min)
3. ✅ **Deactivate listing** (2 min)
4. ✅ **Monitor workflow execution** (60-90 min)
5. ✅ **Test Amazon Message** (5 min)
6. ✅ **Approve order** (5 min)
7. ✅ **Cancel BEFORE Lulu submission** (CRITICAL)

**Cost**: $0 (if cancelled before Lulu)

---

### **LATER: Phase 3 - Full Print Test** (Optional)

**Time Required**: 7-10 days (delivery time)

**Cost**: ~$30

**Only do this when**:
- ✅ Phases 1 and 2 successful
- ✅ Confident in system
- ✅ Ready to validate physical quality

---

## ⚠️ **CRITICAL: Workflow 0 Configuration**

**IMPORTANT**: Your Workflow 0 is currently using a **mock order generator**. To test with REAL Amazon orders (Phase 2), you need to:

### **Option A: Keep Mock for Phase 1** (Recommended)
- Use mock order generator for Phase 1 testing
- This is what you have now - perfect for initial testing
- No changes needed

### **Option B: Configure Real Amazon Order Fetching** (For Phase 2)
- Add Amazon SP-API order fetching to Workflow 0
- Replace mock order generator with SP-API call
- See `docs/amazon/AMAZON_SETUP_GUIDE.md` for details

**Current Workflow 0 Setup**:
```javascript
// Lines 17-18 in LHB - 0 - ORDER INTAKE VALIDATION.json
const TEST_CONFIG = {
  orderId: "hair-test-02",
  childName: "Gio",
  // ... mock data
};
```

**What You Need for Phase 2**:
- Amazon SP-API call to fetch orders
- Cron trigger (every 10 minutes)
- Order filtering (only fetch "Unshipped" orders)
- Character spec extraction from Amazon Custom fields

**Who Should Do This**: Developer A (workflow owner) or you can do it together

**Reference**: 
- `docs/amazon/AMAZON_INTEGRATION.md` - SP-API setup
- `docs/amazon/sp-api-integration-code.md` - Code examples

---

## 📋 **Quick Start Checklist**

### **Before You Start**:
- [ ] Backend server running (`cd back-end && npm run dev`)
- [ ] n8n accessible (your n8n URL)
- [ ] Supabase credentials in Workflow 0 CONFIG node
- [ ] Amazon SP-API credentials in `back-end/.env.local`
- [ ] Lulu API credentials in Workflow 4 CONFIG node

### **Phase 1 (Mock Order)**:
- [ ] Update mock order with your email
- [ ] Run Workflow 0 → verify database
- [ ] Run Workflows 2A, 2B, 3 → verify PDF
- [ ] Test Amazon Messaging API → verify message
- [ ] Approve order → verify database
- [ ] Run Workflow 4 → cancel Lulu job

### **Phase 2 (Real Order)** - Only after Phase 1 success:
- [ ] Configure Workflow 0 for real Amazon orders
- [ ] Reactivate listing temporarily
- [ ] Place test order
- [ ] Deactivate listing
- [ ] Monitor workflow execution
- [ ] Cancel before Lulu submission

### **Phase 3 (Full Print)** - Optional:
- [ ] Place final test order
- [ ] Let it print (don't cancel)
- [ ] Receive and inspect book
- [ ] Document quality

---

## 📊 **Complete Verification Checklist**

### **Phase 1: Mock Order Testing**
- [ ] Mock order configured with your email
- [ ] Workflow 0 executed successfully
- [ ] Order appears in Supabase `orders` table
- [ ] Workflow 1 routed order to 2A
- [ ] Workflow 2A generated character images
- [ ] Workflow 2B removed backgrounds
- [ ] Workflow 3 assembled PDF
- [ ] Amazon Messaging API called successfully
- [ ] Message received in Amazon Message Center
- [ ] Preview link works
- [ ] Preview page displays PDF correctly
- [ ] Approval flow works
- [ ] Workflow 4 submitted to Lulu
- [ ] `lulu_job_id` stored in database
- [ ] Lulu job cancelled (no print cost)

### **Phase 2: Real Amazon Order**
- [ ] Workflow 0 configured for real Amazon orders
- [ ] Listing temporarily reactivated
- [ ] Real test order placed
- [ ] Listing deactivated again
- [ ] Order fetched from Amazon SP-API
- [ ] Character specs extracted correctly
- [ ] Complete workflow executed (0 → 1 → 2A → 2B → 3)
- [ ] Amazon Message received
- [ ] Preview link works with real order
- [ ] Order cancelled before Lulu submission
- [ ] No print costs incurred

### **Phase 3: Full Print Test** (Optional)
- [ ] Final test order placed
- [ ] Complete workflow executed
- [ ] Order submitted to Lulu (not cancelled)
- [ ] Lulu status updates tracked
- [ ] Tracking number received
- [ ] Physical book delivered (7-10 days)
- [ ] Print quality acceptable
- [ ] Character looks correct
- [ ] Overall quality meets standards

### **System Integration Verification**
- [ ] **Amazon SP-API**: Fetching orders correctly
- [ ] **Amazon Messaging API**: Sending messages successfully
- [ ] **Supabase**: All data persisting correctly
- [ ] **Cloudflare R2**: Manifests and PDFs stored
- [ ] **n8n Workflows**: All executing without errors
- [ ] **Lulu API**: Submitting jobs successfully
- [ ] **Customer Preview**: Page loading and working
- [ ] **Webhook Integration**: Lulu status updates (if configured)

---

## 🚨 **Troubleshooting Guide**

### **Common Issues & Solutions**

#### **1. Mock Order Not Appearing in Database**

**Symptoms**:
- Workflow 0 executes but no database record
- Supabase upsert node shows errors

**Solutions**:
- ✅ Check CONFIG node has correct Supabase credentials
- ✅ Verify `serviceKey` is the SERVICE_ROLE key (not anon key)
- ✅ Check Supabase project is active
- ✅ Review "Supabase: upsert order" node logs for specific error

**SQL to Verify**:
```sql
-- Check if ANY orders exist
SELECT COUNT(*) FROM orders;

-- Check recent orders
SELECT amazon_order_id, status, created_at
FROM orders
ORDER BY created_at DESC
LIMIT 5;
```

---

#### **2. Amazon Message Not Sent**

**Symptoms**:
- Workflow 3 completes but no message in Amazon Message Center
- API returns errors

**Solutions**:
- ✅ Check `back-end/.env.local` has production SP-API credentials
- ✅ Verify `AMAZON_SANDBOX_MODE=false`
- ✅ Check AWS IAM credentials are correct
- ✅ Verify order has valid `customer_email`
- ✅ Check `notification_logs` table for error details

**SQL to Check Logs**:
```sql
SELECT 
  order_id,
  notification_type,
  status,
  message_id,
  error_message,
  created_at
FROM notification_logs
ORDER BY created_at DESC
LIMIT 10;
```

**Test API Directly**:
```bash
cd /Users/johncapogna/Sites/little-hero-books/back-end

curl -X POST http://localhost:3000/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "YOUR_ORDER_ID",
    "token": "YOUR_PREVIEW_TOKEN",
    "reminderType": "initial"
  }'
```

---

#### **3. Preview Link Returns 404**

**Symptoms**:
- Click preview link from Amazon Message
- Page shows "Order not found" or 404 error

**Solutions**:
- ✅ Verify preview token is valid (check `preview_tokens` table)
- ✅ Check order exists in database
- ✅ Verify preview page is deployed at `https://admin.littleherolabs.com`
- ✅ Check backend server is running

**SQL to Verify Token**:
```sql
SELECT 
  pt.token,
  pt.order_id,
  pt.expires_at,
  pt.used_at,
  o.amazon_order_id,
  o.final_book_url
FROM preview_tokens pt
JOIN orders o ON pt.order_id = o.id
WHERE pt.token = 'YOUR_TOKEN_HERE';
```

---

#### **4. Lulu API Submission Fails**

**Symptoms**:
- Workflow 4 executes but no `lulu_job_id` in database
- Lulu API returns errors

**Solutions**:
- ✅ Check Lulu API credentials in Workflow 4 CONFIG node
- ✅ Verify PDF meets Lulu specifications (size, format, pages)
- ✅ Check shipping address is complete (phone number required!)
- ✅ Verify Lulu account has sufficient credit/payment method

**SQL to Check Order Details**:
```sql
SELECT 
  amazon_order_id,
  final_book_url,
  shipping_address,
  lulu_job_id,
  lulu_status
FROM orders
WHERE amazon_order_id = 'YOUR_ORDER_ID';
```

**Common Lulu API Errors**:
- **"Invalid phone number"**: Ensure `shipping_address.phone` is in E.164 format (+1-555-123-4567)
- **"Invalid PDF"**: Check PDF is exactly 16 pages, 8.5×8.5 inches
- **"Authentication failed"**: Verify Lulu API credentials

---

#### **5. Workflow 0 Not Fetching Real Amazon Orders**

**Symptoms**:
- Real order placed on Amazon
- Workflow 0 runs but order not fetched
- Only mock orders appear in database

**Solutions**:
- ✅ **CRITICAL**: Workflow 0 is currently using mock order generator
- ✅ You need to add Amazon SP-API order fetching logic
- ✅ See `docs/amazon/AMAZON_INTEGRATION.md` for implementation
- ✅ This is a Developer A task (workflow owner)

**What's Needed**:
1. Add HTTP Request node to call Amazon SP-API `getOrders` endpoint
2. Filter for "Unshipped" orders with your listing SKU
3. Extract customization fields from order items
4. Map to your character specs format
5. Pass to existing normalization logic

**Reference Code**: See `docs/amazon/sp-api-integration-code.md`

---

#### **6. Character Images Not Generating**

**Symptoms**:
- Workflow 2A executes but no images created
- Bria AI API errors

**Solutions**:
- ✅ Check Bria AI API credentials
- ✅ Verify API quota/credits available
- ✅ Check prompt formatting is correct
- ✅ Review Workflow 2A execution logs

---

#### **7. PDF Not Displaying in Preview**

**Symptoms**:
- Preview page loads but PDF doesn't display
- Blank page or loading spinner

**Solutions**:
- ✅ Check `final_book_url` in database is valid R2 path
- ✅ Verify PDF exists in Cloudflare R2
- ✅ Check signed URL generation is working
- ✅ Test PDF URL directly in browser

**SQL to Check PDF**:
```sql
SELECT 
  amazon_order_id,
  final_book_url,
  manifest_3_url
FROM orders
WHERE amazon_order_id = 'YOUR_ORDER_ID';
```

---

### **Debugging Tools**

#### **1. n8n Execution Logs**
- Go to n8n dashboard
- Click "Executions" tab
- Find your workflow execution
- Click to view detailed logs
- Check each node for errors

#### **2. Supabase Database Queries**
```sql
-- Complete order status
SELECT 
  amazon_order_id,
  status,
  execution_status,
  next_workflow,
  character_hash,
  one_manifest_url,
  manifest_2a_url,
  manifest_2b_url,
  manifest_3_url,
  final_book_url,
  customer_approval_status,
  lulu_job_id,
  lulu_status,
  created_at,
  updated_at
FROM orders
WHERE amazon_order_id = 'YOUR_ORDER_ID';

-- Notification attempts
SELECT 
  notification_type,
  status,
  message_id,
  error_message,
  created_at
FROM notification_logs
WHERE order_id = (SELECT id FROM orders WHERE amazon_order_id = 'YOUR_ORDER_ID')
ORDER BY created_at DESC;

-- Customer feedback
SELECT 
  correction_reason,
  correction_details,
  customer_email,
  created_at
FROM customer_feedback
WHERE order_id = (SELECT id FROM orders WHERE amazon_order_id = 'YOUR_ORDER_ID');
```

#### **3. Backend Logs**
```bash
# In your backend terminal
cd /Users/johncapogna/Sites/little-hero-books/back-end
npm run dev

# Watch for:
# - API endpoint calls
# - Database connection errors
# - Amazon API responses
# - Lulu API responses
```

#### **4. Browser Developer Tools**
- Open preview page
- Press F12 (Developer Tools)
- Check Console tab for JavaScript errors
- Check Network tab for failed API calls
- Check Application tab for token storage

---

### **Getting Help**

If you're stuck:

1. **Check Documentation**:
   - `docs/amazon/AMAZON_INTEGRATION.md`
   - `docs/amazon/AMAZON_MESSAGING_STATUS.md`
   - `docs/CUSTOMER_PREVIEW_APPROVAL_SYSTEM.md`
   - `DEVELOPER_A_PACKAGE.md`
   - `DEVELOPER_B_PACKAGE.md`

2. **Review Workflow Files**:
   - `docs/n8n-workflow-files/finals/` - All workflow JSON files

3. **Check Backend Code**:
   - `back-end/src/lib/notifications/amazon-message-center.ts`
   - `back-end/src/app/api/notifications/preview/amazon/route.ts`

4. **Database Schema**:
   - `docs/database/supabase-schema.sql`

---

## 📝 **Documentation Updates After Testing**

After completing each phase, update these documents:

### **After Phase 1 (Mock Order)**:
- [ ] Update this file with test results
- [ ] Note any issues encountered
- [ ] Document any workflow changes made
- [ ] Update `DEVELOPER_B_PACKAGE.md` with progress

### **After Phase 2 (Real Order)**:
- [ ] `AMAZON_MESSAGING_STATUS.md` - Confirm messaging API working
- [ ] `DEVELOPER_A_PACKAGE.md` - Mark Amazon listing tested
- [ ] `DEVELOPER_B_PACKAGE.md` - Update integration status
- [ ] This file - Mark Phase 2 complete

### **After Phase 3 (Full Print)**:
- [ ] Document physical book quality
- [ ] Add photos to `docs/amazon/` folder
- [ ] Update product listing if needed
- [ ] Create quality report
- [ ] Share results with team

---

## 🎯 **Success Criteria Summary**

### **Phase 1: Mock Order** (TODAY)
**Goal**: Test complete workflow without real Amazon order

**Success Criteria**:
- ✅ Mock order processed through all workflows (0 → 1 → 2A → 2B → 3 → 4)
- ✅ Amazon Messaging API sends message successfully
- ✅ Preview link works and displays PDF
- ✅ Customer approval flow functional
- ✅ Lulu API submission works (cancelled before print)
- ✅ No critical errors in logs
- ✅ All data persists correctly in database

**Cost**: $0 (if Lulu job cancelled in time)  
**Time**: 2-3 hours

---

### **Phase 2: Real Amazon Order** (NEXT)
**Goal**: Validate real Amazon integration end-to-end

**Success Criteria**:
- ✅ Real order fetched from Amazon SP-API
- ✅ Character specs extracted correctly from Amazon Custom fields
- ✅ Complete workflow execution (0 → 1 → 2A → 2B → 3)
- ✅ Amazon Message received in buyer's Message Center
- ✅ Preview link works with real order data
- ✅ Order cancelled before Lulu submission
- ✅ No print costs incurred

**Cost**: $0 (if cancelled before Lulu)  
**Time**: 2-3 hours (plus monitoring)

**Prerequisites**:
- ✅ Phase 1 successful
- ✅ Workflow 0 configured for real Amazon orders
- ✅ Confidence level: HIGH

---

### **Phase 3: Full Print Test** (OPTIONAL)
**Goal**: Validate physical book quality

**Success Criteria**:
- ✅ Complete end-to-end order (not cancelled)
- ✅ Lulu status updates tracked via webhook
- ✅ Physical book received (7-10 days)
- ✅ Print quality meets standards
- ✅ Character appearance correct
- ✅ Overall quality acceptable for customers

**Cost**: ~$30 (book + shipping)  
**Time**: 7-10 days (delivery)

**Prerequisites**:
- ✅ Phases 1 and 2 successful
- ✅ Ready to validate physical quality
- ✅ Budget approved for test print

---

## 🚀 **Ready for Launch Checklist**

Before reactivating your Amazon listing for real customers:

### **Technical Readiness**:
- [ ] All 3 phases tested successfully (or at least Phases 1-2)
- [ ] No critical bugs or errors
- [ ] All workflows executing reliably
- [ ] Amazon Messaging API working consistently
- [ ] Customer preview system functional
- [ ] Lulu integration tested and working
- [ ] Database persisting all data correctly
- [ ] Error handling and monitoring in place

### **Business Readiness**:
- [ ] Physical book quality acceptable (Phase 3)
- [ ] Pricing finalized ($27.99 or adjusted)
- [ ] Shipping options configured
- [ ] Customer service plan ready
- [ ] Refund/return policy documented
- [ ] FAQ page created (if needed)
- [ ] Team trained on order monitoring

### **Marketing Readiness**:
- [ ] Product images finalized (all 7)
- [ ] Listing copy optimized
- [ ] Keywords researched and added
- [ ] Amazon PPC campaign ready (optional)
- [ ] Social media posts prepared (optional)
- [ ] Launch announcement ready (optional)

### **Monitoring & Support**:
- [ ] n8n workflows monitored daily
- [ ] Database checked for errors
- [ ] Customer messages responded to within 24 hours
- [ ] Order processing monitored closely
- [ ] Lulu status updates tracked
- [ ] Quality issues addressed immediately

---

## 📅 **Recommended Timeline**

### **Week 1: Initial Testing**
- **Day 1** (TODAY): Phase 1 - Mock order testing (2-3 hours)
- **Day 2**: Fix any issues from Phase 1
- **Day 3**: Configure Workflow 0 for real Amazon orders
- **Day 4**: Phase 2 - Real Amazon order testing (2-3 hours)
- **Day 5**: Fix any issues from Phase 2
- **Day 6-7**: Optional: Place Phase 3 order (full print test)

### **Week 2-3: Quality Validation** (if doing Phase 3)
- **Day 8-14**: Wait for physical book delivery
- **Day 15**: Receive and inspect book
- **Day 16**: Document quality, take photos
- **Day 17**: Make any final adjustments

### **Week 3-4: Launch Preparation**
- **Day 18-20**: Final system checks
- **Day 21**: Reactivate Amazon listing
- **Day 22**: Monitor first customer orders closely
- **Day 23-30**: Continue monitoring, iterate as needed

**Accelerated Timeline** (Skip Phase 3):
- **Day 1**: Phase 1 testing
- **Day 2**: Phase 2 testing
- **Day 3**: Final checks and launch
- **Day 4+**: Monitor customer orders

---

## 🎊 **After Launch**

Once your listing is live and accepting customer orders:

### **First Week**:
- [ ] Monitor EVERY order closely
- [ ] Check n8n executions daily
- [ ] Respond to customer messages within 4 hours
- [ ] Watch for any errors or issues
- [ ] Document any problems and solutions

### **First Month**:
- [ ] Review first 10-20 orders for patterns
- [ ] Collect customer feedback
- [ ] Optimize workflows based on learnings
- [ ] Adjust pricing if needed
- [ ] Improve product images/listing if needed
- [ ] Consider Amazon PPC campaign

### **Ongoing**:
- [ ] Weekly workflow health checks
- [ ] Monthly quality reviews
- [ ] Quarterly pricing analysis
- [ ] Continuous improvement based on feedback
- [ ] Scale up as demand grows

---

## 📞 **Support & Resources**

### **Documentation**:
- **This File**: Complete testing guide
- **Amazon Integration**: `docs/amazon/AMAZON_INTEGRATION.md`
- **Messaging API**: `docs/amazon/AMAZON_MESSAGING_STATUS.md`
- **Customer Preview**: `docs/CUSTOMER_PREVIEW_APPROVAL_SYSTEM.md`
- **Developer Packages**: `DEVELOPER_A_PACKAGE.md`, `DEVELOPER_B_PACKAGE.md`

### **Workflow Files**:
- **All Workflows**: `docs/n8n-workflow-files/finals/`
- **Workflow 0**: Order Intake & Validation
- **Workflows 2A, 2B, 3**: Character generation & PDF assembly
- **Workflow 4**: Print & Fulfillment

### **Backend Code**:
- **Amazon Messaging**: `back-end/src/lib/notifications/amazon-message-center.ts`
- **Preview API**: `back-end/src/app/api/notifications/preview/amazon/route.ts`
- **Database**: `back-end/src/lib/supabase-client.ts`

### **Database**:
- **Supabase Dashboard**: https://mdnthwpcnphjnnblbvxk.supabase.co
- **Schema**: `docs/database/supabase-schema.sql`

---

## 🎯 **Summary: Your Path to First Sale**

### **Where You Are Now**:
✅ Amazon listing approved (deactivated for testing)  
✅ Production credentials configured  
✅ All workflows ready  
✅ Amazon Messaging API implemented  
✅ Customer preview system live  
✅ Lulu integration ready  

### **What You Need to Do**:
1. **TODAY**: Run Phase 1 (mock order testing) - 2-3 hours
2. **THIS WEEK**: Run Phase 2 (real Amazon order) - 2-3 hours
3. **OPTIONAL**: Run Phase 3 (full print test) - 7-10 days
4. **LAUNCH**: Reactivate listing and accept first customer order! 🚀

### **Expected Results**:
- ✅ Complete end-to-end testing without excessive costs
- ✅ Confidence in system reliability
- ✅ Ready to serve real customers
- ✅ First sale within days of launch!

---

**Status**: ✅ **LISTING APPROVED - READY FOR TESTING**  
**Next Action**: Start Phase 1 testing TODAY  
**Timeline to Launch**: 3-7 days (depending on whether you do Phase 3)  
**Cost to Test**: $0-30 (depending on phases)

---

**🎊 CONGRATULATIONS ON YOUR AMAZON APPROVAL! LET'S GET YOUR FIRST SALE! 🚀**

