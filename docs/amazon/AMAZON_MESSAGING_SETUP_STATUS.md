# Amazon Messaging API Setup Status

## ✅ Current Implementation

The Amazon Messages API is **fully implemented** and integrated with the "Send for Customer Approval" button.

### Flow

1. **Admin Reviews Book** → Approves postPdf stage
2. **Admin Clicks "Send for Customer Approval"** → Triggers `/api/orders/[orderId]/final-approval`
3. **Backend Sends Amazon Message** → If `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true`
4. **Customer Receives Message** → Via Amazon Message Center with preview link

### Code Path

```
PostPdfStage Component
  ↓
"Send for Customer Approval" Button (onClick)
  ↓
handleInitiateWorkflow('postPdf')
  ↓
POST /api/orders/[orderId]/final-approval
  ↓
Checks: AMAZON_PREVIEW_NOTIFICATIONS_ENABLED === 'true'
  ↓
sendAmazonPreviewMessage() → Amazon Messages API
  ↓
Message sent to customer via Amazon Message Center
```

## ⚙️ Configuration Required

### Environment Variables

Add to `back-end/.env.local`:

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

# === Enable Amazon Messaging ===
AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true

# === Customer Site Configuration ===
CUSTOMER_SITE_URL=https://littleherolabs.com
PREVIEW_AUTO_APPROVAL_HOURS=72
```

### Critical Variable

**`AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true`** - This must be set to `'true'` (string) for messages to be sent.

## 🔍 How to Verify Setup

### Option 1: Check Configuration Endpoint

```bash
curl https://admin.littleherolabs.com/api/admin/check-amazon-messaging
```

This will show:
- Which environment variables are configured
- Whether notifications are enabled
- Any missing configuration

### Option 2: Check Response After Clicking Button

When you click "Send for Customer Approval", check the browser console or network tab. The response from `/api/orders/[orderId]/final-approval` includes:

```json
{
  "success": true,
  "notification": {
    "attempted": true,
    "sent": true,  // or false if failed
    "reason": "...",  // if not sent, explains why
    "response": {
      "success": true,
      "messageId": "amzn-msg-123456",
      "documentId": "doc-789012"
    }
  }
}
```

### Option 3: Check Notification Logs

```sql
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

## 🐛 Troubleshooting

### Message Not Sending

**Check 1: Environment Variable**
```bash
# Verify AMAZON_PREVIEW_NOTIFICATIONS_ENABLED is set
echo $AMAZON_PREVIEW_NOTIFICATIONS_ENABLED
# Should output: true
```

**Check 2: Configuration Validation**
The `sendAmazonPreviewMessage` function validates all required environment variables. If any are missing, it returns:
```json
{
  "success": false,
  "error": "Amazon Message Center env configuration is incomplete",
  "issues": [...]
}
```

**Check 3: Order Has amazon_order_id**
The message can only be sent if the order has an `amazon_order_id`. Check:
```sql
SELECT amazon_order_id FROM orders WHERE order_id = 'YOUR_ORDER_ID';
```

**Check 4: Preview Token**
If a preview token already exists, the endpoint will reuse it but won't send a new message. The response will show:
```json
{
  "notification": {
    "attempted": false,
    "sent": false,
    "reason": "Preview token already active; skipping new notification."
  }
}
```

### Common Issues

1. **"Amazon preview messaging disabled by configuration"**
   - Set `AMAZON_PREVIEW_NOTIFICATIONS_ENABLED=true` in `.env.local`
   - Restart Next.js server

2. **"Amazon Message Center env configuration is incomplete"**
   - Check all required environment variables are set
   - See `back-end/src/lib/notifications/amazon-message-center.ts` for full list

3. **"Amazon does not allow confirmCustomizationDetails for this order"**
   - Order may be too old or already shipped
   - Messages can only be sent for unshipped orders
   - Check order status in Amazon Seller Central

4. **"Failed to obtain Amazon LWA access token"**
   - Verify SP-API credentials are correct
   - Check refresh token is not expired
   - Ensure you're using production credentials (not sandbox)

## ✅ Success Indicators

When everything is working:

1. **Button Click Response** shows `notification.sent: true`
2. **Notification Logs** show `status: 'sent'` with a `messageId`
3. **Amazon Message Center** shows the message in Seller Central
4. **Customer Receives Email** notification from Amazon
5. **Customer Can Click Preview Link** in the message

## 📝 Next Steps

1. **Set Environment Variables** - Add all required variables to `.env.local`
2. **Restart Server** - Restart Next.js to load new environment variables
3. **Test with Real Order** - Click "Send for Customer Approval" on a test order
4. **Verify in Amazon** - Check Amazon Message Center to confirm message was sent
5. **Check Customer Email** - Verify customer received email notification

---

**Last Updated**: 2025-01-08
**Status**: ✅ Implementation Complete - Ready for Configuration

