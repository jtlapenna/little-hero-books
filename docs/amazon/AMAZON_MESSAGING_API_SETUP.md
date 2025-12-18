# Amazon Messaging API - Complete Setup Guide

**Purpose**: Send customer preview links via Amazon Message Center when their book proof is ready.

---

## 🎯 **Overview**

The Amazon Messaging API allows you to send messages to customers through Amazon's Message Center. This is **critical** for your workflow because:

1. **Customer Preview Delivery**: After Workflow 3 generates the book PDF, you need to send the customer a preview link
2. **Amazon Compliance**: Using Amazon Message Center keeps you compliant with Amazon's communication policies
3. **Customer Trust**: Messages appear in Amazon's official interface, building trust
4. **Tracking**: All messages are logged in your `notification_logs` table

---

## ✅ **Current Implementation Status**

### **Already Built** ✅
- ✅ Complete TypeScript implementation: `back-end/src/lib/notifications/amazon-message-center.ts`
- ✅ API endpoint: `back-end/src/app/api/notifications/preview/amazon/route.ts`
- ✅ Message templates with HTML styling
- ✅ Document encryption and upload
- ✅ AWS SigV4 request signing
- ✅ Error handling and retry logic
- ✅ Notification logging to Supabase

### **What You Need** ⚠️
- ⚠️ AWS IAM credentials (Access Key ID + Secret Access Key)
- ⚠️ Production Amazon SP-API credentials
- ⚠️ Environment variables configured

---

## 🔧 **Step 1: Get AWS IAM Credentials**

### **Why AWS IAM?**
Amazon SP-API requires AWS SigV4 signing for all API requests. This is separate from your Amazon SP-API credentials.

### **Create IAM User**

1. **Go to AWS Console**: https://console.aws.amazon.com/iam/

2. **Create New User**:
   - Click "Users" → "Add users"
   - User name: `little-hero-labs-sp-api`
   - Access type: ✅ "Programmatic access" (not console access)

3. **Attach Permissions**:
   - Click "Attach policies directly"
   - Search for: `LittleHeroLabsSpApiAccess`
   - ✅ Check the box
   - (This is the custom policy you created)

4. **Create Custom Policy** (Optional - More Secure):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "execute-api:Invoke"
         ],
         "Resource": [
           "arn:aws:execute-api:*:*:*/*/POST/messaging/v1/orders/*/messages/*",
           "arn:aws:execute-api:*:*:*/*/GET/messaging/v1/orders/*",
           "arn:aws:execute-api:*:*:*/*/POST/uploads/2020-11-01/uploadDestinations/messaging"
         ]
       }
     ]
   }
   ```
   
   **Note**: The upload endpoint was updated from `/uploads/v1/documents` to `/uploads/2020-11-01/uploadDestinations/messaging` per Amazon Support guidance (2025-12-17).

5. **Save Credentials**:
   - **Access Key ID**: `AKIA...` (starts with AKIA)
   - **Secret Access Key**: Long random string
   - ⚠️ **SAVE IMMEDIATELY** - Secret key only shown once!

---

## 🔧 **Step 2: Configure Environment Variables**

### **Update `back-end/.env.local`**

Add these variables:

```bash
# === Amazon SP-API Configuration ===
AMZ_APP_CLIENT_ID=your_production_client_id
AMZ_APP_CLIENT_SECRET=your_production_client_secret
AMZ_REFRESH_TOKEN=Atzr|your_production_refresh_token
AMZ_SELLER_ID=your_seller_id
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na

# === AWS IAM Credentials (for Message Center) ===
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1

# === Production Mode ===
AMAZON_SANDBOX_MODE=false

# === Customer Site Configuration ===
CUSTOMER_SITE_URL=https://littleherolabs.com
PREVIEW_AUTO_APPROVAL_HOURS=72
```

### **Environment Variable Reference**

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `AMZ_APP_CLIENT_ID` | ✅ Yes | SP-API Client ID | `amzn1.application-oa2-client.xxxxx` |
| `AMZ_APP_CLIENT_SECRET` | ✅ Yes | SP-API Client Secret | `amzn1.oa2-cs.v1.xxxxx` |
| `AMZ_REFRESH_TOKEN` | ✅ Yes | SP-API Refresh Token | `Atzr\|xxxxx` |
| `AMZ_SELLER_ID` | ✅ Yes | Your Seller ID | `A2V719MRGLK48O` |
| `AMZ_MARKETPLACE_ID` | ✅ Yes | Marketplace ID | `ATVPDKIKX0DER` (US) |
| `AMZ_REGION` | ✅ Yes | SP-API Region | `na` (North America) |
| `AWS_ACCESS_KEY_ID` | ✅ Yes | IAM Access Key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | ✅ Yes | IAM Secret Key | Long random string |
| `AWS_REGION` | ✅ Yes | AWS Region | `us-east-1` |
| `CUSTOMER_SITE_URL` | ✅ Yes | Customer site URL | `https://littleherolabs.com` |
| `PREVIEW_AUTO_APPROVAL_HOURS` | ❌ No | Auto-approval time | `72` (default) |

---

## 🧪 **Step 3: Test the API**

### **Test 1: Check Configuration**

```bash
# Test that environment variables are loaded
curl -X POST https://admin.littleherolabs.com/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "INVALID-ORDER",
    "token": "test-token",
    "reminderType": "initial"
  }'
```

**Expected Response** (if config is missing):
```json
{
  "success": false,
  "error": "Amazon Message Center env configuration is incomplete",
  "issues": [
    {
      "code": "too_small",
      "path": ["awsAccessKeyId"],
      "message": "AWS_ACCESS_KEY_ID is required"
    }
  ]
}
```

### **Test 2: Test with Real Order**

First, create a test order in Supabase:

```sql
INSERT INTO orders (
  order_id,
  amazon_order_id,
  status,
  character_specs,
  created_at
) VALUES (
  'TEST-MSG-001',
  'TEST-MSG-001',
  'pdf_generated',
  '{"childName": "Alex", "age": 5}',
  NOW()
);
```

Then generate a preview token:

```bash
curl -X POST https://admin.littleherolabs.com/api/preview/generate-token \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-MSG-001"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "token": "abc123def456...",
  "previewUrl": "https://littleherolabs.com/approve/abc123def456..."
}
```

Now test sending the message:

```bash
curl -X POST https://admin.littleherolabs.com/api/notifications/preview/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-MSG-001",
    "token": "abc123def456...",
    "reminderType": "initial"
  }'
```

**Expected Success Response**:
```json
{
  "success": true,
  "messageId": "amzn-msg-123456",
  "documentId": "doc-789012",
  "previewUrl": "https://littleherolabs.com/approve/abc123def456...",
  "reminderType": "initial"
}
```

**Expected Error Response** (if order not found):
```json
{
  "success": false,
  "error": "Order TEST-MSG-001 not found"
}
```

---

## 📧 **Step 4: Verify Message in Amazon**

### **Check Amazon Message Center**

1. **Go to Amazon Seller Central**
2. **Navigate to**: Performance → Buyer-Seller Messages
3. **Look for**: Message to customer for order `TEST-MSG-001`
4. **Verify**: Message contains preview link and correct content

### **Message Content**

The message will look like this:

```
Subject: Little Hero Books – Preview Ready

Your personalized storybook preview is ready.

Tap below to review Alex's Adventure Compass story:

[Review Book Preview] (button)

You have 2 free revisions remaining.

If we do not hear from you within three days, we will approve 
the story automatically and move it into production.

Need help? Reply to this message or email hello@littleherobooks.com.

Every child is the hero of their own story.
Little Hero Books
```

---

## 🔄 **Step 5: Integrate with Workflow 3**

### **Current Workflow 3 Flow**

```
Workflow 3: Book Assembly
    ↓
PDF Generated
    ↓
Upload to R2
    ↓
Generate Preview Token
    ↓
[NEW] Send Amazon Message ← Add this step
    ↓
Update Order Status
```

### **Add HTTP Request Node to Workflow 3**

1. **Open n8n** → Workflow 3: `LHB - 3 - PNG Assembly`

2. **Add HTTP Request Node** after "Generate Preview Token":
   - **Name**: `Send Amazon Preview Message`
   - **Method**: `POST`
   - **URL**: `https://admin.littleherolabs.com/api/notifications/preview/amazon`
   - **Authentication**: None
   - **Body**: JSON

3. **Configure Body**:
   ```json
   {
     "orderId": "{{ $json.orderId }}",
     "token": "{{ $json.token }}",
     "reminderType": "initial"
   }
   ```

4. **Add Error Handling**:
   - If message fails, log error but don't block workflow
   - Continue to next step even if message fails
   - Error will be logged in `notification_logs` table

5. **Connect Nodes**:
   ```
   Generate Preview Token
       ↓
   Send Amazon Preview Message
       ↓
   Update Order Status
   ```

---

## 📊 **Step 6: Monitor and Verify**

### **Check Notification Logs**

```sql
-- View all Amazon message attempts
SELECT 
  order_id,
  notification_type,
  status,
  recipient,
  error_message,
  sent_at,
  created_at
FROM notification_logs
WHERE notification_type = 'amazon_message'
ORDER BY created_at DESC
LIMIT 10;
```

### **Check Successful Messages**

```sql
-- View successful messages
SELECT 
  order_id,
  status,
  recipient,
  error_message,
  sent_at
FROM notification_logs
WHERE notification_type = 'amazon_message'
  AND status = 'sent'
ORDER BY sent_at DESC;
```

### **Check Failed Messages**

```sql
-- View failed messages
SELECT 
  order_id,
  status,
  recipient,
  error_message,
  created_at
FROM notification_logs
WHERE notification_type = 'amazon_message'
  AND status = 'failed'
ORDER BY created_at DESC;
```

---

## 🚨 **Troubleshooting**

### **Error: "Amazon Message Center env configuration is incomplete"**

**Cause**: Missing environment variables

**Solution**: 
1. Check `back-end/.env.local` has all required variables
2. Restart Next.js server: `npm run dev` in `back-end/`
3. Verify variables are loaded: Check console logs on startup

---

### **Error: "Failed to obtain Amazon LWA access token"**

**Cause**: Invalid SP-API credentials

**Solution**:
1. Verify `AMZ_APP_CLIENT_ID` is correct
2. Verify `AMZ_APP_CLIENT_SECRET` is correct
3. Verify `AMZ_REFRESH_TOKEN` is correct and not expired
4. Check you're using **production** credentials (not sandbox)

---

### **Error: "Amazon SP-API request failed with status 403"**

**Cause**: Invalid AWS IAM credentials or insufficient permissions

**Solution**:
1. Verify `AWS_ACCESS_KEY_ID` is correct
2. Verify `AWS_SECRET_ACCESS_KEY` is correct
3. Check IAM user has correct permissions
4. Verify IAM user has `execute-api:Invoke` permission

---

### **Error: "Amazon does not allow confirmCustomizationDetails for this order"**

**Cause**: Order is too old or already shipped

**Solution**:
1. Messages can only be sent for unshipped orders
2. Check order status in Amazon Seller Central
3. Verify order is still in "Unshipped" status
4. If order is shipped, message cannot be sent

---

### **Error: "Order not found"**

**Cause**: Order doesn't exist in Supabase

**Solution**:
1. Verify order exists: `SELECT * FROM orders WHERE order_id = 'XXX'`
2. Check `amazon_order_id` field is populated
3. Ensure Workflow 0 successfully created the order

---

## 📚 **API Reference**

### **Endpoint**: `POST /api/notifications/preview/amazon`

### **Request Body**:
```typescript
{
  orderId: string;        // Order ID from Supabase
  token: string;          // Preview token from /api/preview/generate-token
  reminderType?: 'initial' | 'reminder-day-1' | 'reminder-day-2' | 'auto-approval';
}
```

### **Response** (Success):
```typescript
{
  success: true;
  messageId: string;      // Amazon message ID
  documentId: string;     // Amazon document ID
  previewUrl: string;     // Full preview URL
  reminderType: string;   // Reminder type sent
}
```

### **Response** (Error):
```typescript
{
  success: false;
  error: string;          // Error message
  issues?: ZodIssue[];    // Validation issues (if any)
}
```

---

## 🎯 **Message Types**

### **1. Initial Message** (`initial`)
Sent when preview is first ready.

**Timing**: Immediately after Workflow 3 completes

**Content**: "Your personalized storybook preview is ready."

---

### **2. Day 1 Reminder** (`reminder-day-1`)
Sent 24 hours after initial message if no response.

**Timing**: 24 hours after initial message

**Content**: "Friendly reminder: please review your story within the next two days."

---

### **3. Day 2 Reminder** (`reminder-day-2`)
Sent 48 hours after initial message if no response.

**Timing**: 48 hours after initial message

**Content**: "Final reminder: automatic approval fires tomorrow unless you request a revision."

---

### **4. Auto-Approval** (`auto-approval`)
Sent when order is auto-approved after 72 hours.

**Timing**: 72 hours after initial message

**Content**: "Action completed: we approved your story automatically so production can begin right away."

---

## ✅ **Success Checklist**

- [ ] AWS IAM user created with correct permissions
- [ ] AWS credentials added to `.env.local`
- [ ] Amazon SP-API credentials added to `.env.local`
- [ ] `CUSTOMER_SITE_URL` set to production URL
- [ ] Next.js server restarted with new environment variables
- [ ] Test API call returns success
- [ ] Message appears in Amazon Message Center
- [ ] Preview link works and loads approval page
- [ ] Notification logged in `notification_logs` table
- [ ] HTTP Request node added to Workflow 3
- [ ] End-to-end test completed successfully

---

## 🎊 **You're Ready!**

Once all checklist items are complete, the Amazon Messaging API is fully operational. Customers will receive preview links automatically via Amazon Message Center after their book is generated.

---

## 📞 **Need Help?**

- **AWS IAM Issues**: See AWS IAM documentation
- **SP-API Issues**: See `docs/amazon/AMAZON_TROUBLESHOOTING.md`
- **Code Issues**: Check `back-end/src/lib/notifications/amazon-message-center.ts`
- **API Issues**: Check `back-end/src/app/api/notifications/preview/amazon/route.ts`

