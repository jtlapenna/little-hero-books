# Next Steps: Testing, Automation, and Customer Communication

## 1. 🧪 Next Step: Testing with Real Orders

### Current System: **Polling-Based (Not Automatic)**

**How it works:**
- ✅ **Vercel Cron** runs once per day at midnight (free tier)
- ✅ **Manual trigger** available via Vercel dashboard
- ✅ Polls Amazon SP-API for orders from last 24 hours
- ✅ Automatically processes new orders when cron runs

**Does it automatically trigger when someone places an order?**
- ❌ **No, not in real-time**
- ✅ **Yes, but with delay** (up to 24 hours on free tier)
- ✅ **Can be triggered manually** for immediate processing

### Testing Options

#### Option A: Manual Testing (Recommended First)
```bash
# 1. Place a test order on Amazon Custom
# 2. Get the order ID from Amazon Seller Central
# 3. Manually trigger processing:

# Via middleware (if running locally):
curl -X POST "http://localhost:4000/orders/YOUR-ORDER-ID/process"

# Via Vercel cron (manual trigger):
# Go to Vercel Dashboard → Your Project → Cron Jobs → Trigger manually
```

#### Option B: Wait for Cron (Production)
- Cron runs once per day at midnight UTC
- Will automatically pick up orders from last 24 hours
- **Free tier limitation**: Can't run more frequently

#### Option C: Upgrade to Real-Time (Future)
- Upgrade Vercel to Pro ($20/month) for more frequent cron
- Or set up Amazon Notifications API (webhooks) for real-time updates
- See "Real-Time Notifications" section below

### Recommended Testing Flow

1. **Place a test order** on Amazon Custom (sandbox or production)
2. **Note the order ID** from Seller Central
3. **Manually trigger** the cron job via Vercel dashboard
4. **Check logs** to verify:
   - Order was fetched from Amazon
   - Order was stored in Supabase
   - W0 webhook was called
   - W0 processed the order

---

## 2. 📋 Customer Information We Receive

### Data Available from Amazon SP-API

When an order is placed, we receive the following customer information:

#### ✅ **Always Available** (No RDT Required)

**Order Information:**
- `AmazonOrderId` - Unique order identifier
- `PurchaseDate` - When order was placed
- `OrderStatus` - Unshipped, Shipped, etc.
- `MarketplaceId` - Which marketplace (US, EU, etc.)
- `OrderTotal` - Price and currency

**Product Information:**
- `OrderItems` - List of items ordered
- `SellerSKU` - Your product SKU
- `ASIN` - Amazon product identifier
- `Title` - Product title
- `QuantityOrdered` - Quantity
- `ItemPrice` - Price per item

**Customization Data:**
- `BuyerCustomizedInfo.CustomizedInfo` - All customization fields:
  - Child's Name
  - Child's Age
  - Skin Tone
  - Hair Color
  - Hair Style
  - Pronouns
  - Favorite Color
  - Animal Guide
  - Clothing Style
  - Hometown
  - Dedication Message

#### ⚠️ **Requires Restricted Data Token (RDT)** or Approved Roles

**Buyer Information:**
- `BuyerEmail` - Customer email address
- `BuyerName` - Customer name
- `BuyerTaxInformation` - Tax info (if applicable)

**Shipping Address:**
- `Name` - Recipient name
- `AddressLine1` - Street address
- `AddressLine2` - Apartment/suite
- `City` - City
- `StateOrRegion` - State/province
- `PostalCode` - ZIP/postal code
- `CountryCode` - Country (US, etc.)
- `Phone` - Phone number (critical for Lulu API)

### What We Store in Supabase

```typescript
{
  amazon_order_id: string,           // Order ID
  customer_email: string | null,      // Buyer email (if RDT available)
  customer_name: string | null,       // Buyer name (if RDT available)
  shipping_address: {                 // Full address (if RDT available)
    name: string,
    address: string,
    city: string,
    state: string,
    zip: string,
    country: string,
    phone: string | null,             // CRITICAL for Lulu API
  },
  character_specs: {                 // Parsed from customization
    childName: string,
    age: number,
    pronouns: string,
    skinTone: string,
    hairColor: string,
    hairStyle: string,
    favoriteColor: string,
    animalGuide: string,
    clothingStyle: string,
    dedication: string,
  },
  dedication_text: string | null,     // Extracted dedication
  purchase_date: string,              // ISO timestamp
  order_status: string,               // Unshipped, Shipped, etc.
  marketplace_id: string,            // ATVPDKIKX0DER (US)
}
```

### Important Notes

1. **Phone Number**: Required for Lulu API shipping. If not available, you may need to:
   - Request RDT approval from Amazon
   - Or manually add phone numbers for orders missing them

2. **Email**: Useful for sending approval links, but requires RDT or approved roles

3. **Customization Data**: Always available - no RDT needed

---

## 3. 💬 Amazon Messaging API: Sharing Approval URLs

### Overview

Amazon's **Messaging API** allows sellers to send messages to buyers about their orders. This is perfect for sharing approval URLs for book previews.

### API Endpoints

**Base URL:**
- Production: `https://sellingpartnerapi-na.amazon.com`
- Sandbox: `https://sandbox.sellingpartnerapi-na.amazon.com`

**Key Endpoints:**
- `POST /messaging/v1/orders/{amazonOrderId}/messages/legalDisclosure` - Legal disclosure
- `POST /messaging/v1/orders/{amazonOrderId}/messages/invoice` - Invoice
- `POST /messaging/v1/orders/{amazonOrderId}/messages/negativeFeedbackRemoval` - Feedback removal
- `POST /messaging/v1/orders/{amazonOrderId}/messages/other` - **General message (for approval URLs)**

### Implementation Plan

#### Step 1: Add Messaging Endpoint to Middleware

```javascript
// Add to amazon/sp-api-middleware.js

/**
 * Send message to buyer about their order
 * @param {string} orderId - Amazon order ID
 * @param {string} messageText - Message content
 * @param {boolean} useSandbox - Use sandbox environment
 */
async function sendMessageToBuyer(orderId, messageText, useSandbox = false) {
  const endpoint = `/messaging/v1/orders/${orderId}/messages/other`;
  
  const body = {
    text: messageText,
    // Optional: attachments if needed
  };
  
  return await makeSPAPIRequest('POST', endpoint, {}, body, useSandbox);
}

// Add endpoint
app.post('/orders/:orderId/message', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message, useSandbox = isSandbox } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message text required' });
    }
    
    const result = await sendMessageToBuyer(orderId, message, useSandbox === 'true');
    
    res.json({
      success: true,
      orderId,
      messageId: result.payload?.messageId,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Amazon Middleware] Error sending message:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

#### Step 2: Create Approval URL Endpoint

```typescript
// Add to back-end/src/app/api/orders/[orderId]/approval/route.ts

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  const orderId = params.orderId;
  
  // Fetch order from Supabase
  const { supabase } = await import('@/lib/supabase-client');
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('amazon_order_id', orderId)
    .single();
  
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  
  // Generate signed approval URL (expires in 7 days)
  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${orderId}?token=${generateApprovalToken(orderId)}`;
  
  return NextResponse.json({
    orderId,
    approvalUrl,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
```

#### Step 3: Send Message After Book Generation

Add to your workflow (W3 or W4) after book is generated:

```javascript
// In n8n workflow, after book generation

// 1. Get approval URL from backend
const approvalResponse = await $http.get({
  url: `https://admin.littleherolabs.com/api/orders/${orderId}/approval`,
});

const approvalUrl = approvalResponse.approvalUrl;

// 2. Send message to buyer via middleware
const messageText = `Hi! Your personalized book is ready for review. Please click the link below to approve it before we print and ship:

${approvalUrl}

This link expires in 7 days. If you have any questions, please reply to this message.

Thank you for your order!`;

await $http.post({
  url: `https://your-middleware-url.com/orders/${orderId}/message`,
  body: {
    message: messageText,
  },
});
```

### Message Template Example

```
Subject: Your Personalized Book is Ready for Review

Hi [Customer Name],

Your personalized book for [Child's Name] is ready for review!

Please click the link below to view and approve your book:
[Approval URL]

This link expires in 7 days. Once you approve, we'll print and ship your book within 3-5 business days.

If you'd like any changes, please reply to this message and we'll be happy to help.

Thank you for your order!

Best regards,
Little Hero Books Team
```

### Important Considerations

1. **Message Restrictions**: Amazon has strict rules about messaging:
   - Can only message about the specific order
   - Must be order-related (approval is order-related ✅)
   - No promotional content
   - Must respond to buyer messages within 24 hours

2. **Message Timing**: Best to send:
   - After book generation is complete
   - Before printing/shipping
   - With clear expiration date

3. **Approval Flow**: Consider:
   - Approval page shows book preview
   - Customer can approve or request changes
   - Approval updates order status in Supabase
   - Triggers printing workflow

4. **Testing**: Test in sandbox first:
   - Send test message to yourself
   - Verify message appears in Seller Central
   - Check buyer receives email notification

---

## 4. 🔄 Real-Time Notifications (Future Enhancement)

### Current: Polling (24-hour delay)
- Vercel Cron runs once per day
- Polls for orders from last 24 hours

### Future: Real-Time Webhooks

**Amazon Notifications API** allows real-time webhooks:

1. **Set up notification destination** (your webhook endpoint)
2. **Subscribe to order notifications**
3. **Receive webhooks** when orders are placed
4. **Process immediately** (no 24-hour delay)

**Implementation:**
```javascript
// Webhook endpoint to receive Amazon notifications
app.post('/webhooks/amazon/notifications', async (req, res) => {
  const notification = req.body;
  
  if (notification.NotificationType === 'ORDER_CHANGE') {
    const orderId = notification.Data?.AmazonOrderId;
    // Process order immediately
    await processOrder(orderId);
  }
  
  res.status(200).send('OK');
});
```

**Benefits:**
- Real-time processing (seconds, not hours)
- Better customer experience
- Faster approval workflow

**Cost:**
- Requires Vercel Pro ($20/month) or self-hosted webhook endpoint
- More complex setup (webhook security, retries, etc.)

---

## 5. 📝 Recommended Next Steps

### Immediate (Testing)
1. ✅ Place a test order on Amazon Custom
2. ✅ Manually trigger cron job via Vercel dashboard
3. ✅ Verify order appears in Supabase
4. ✅ Check W0 processed the order
5. ✅ Verify book generation workflow runs

### Short-Term (Production)
1. ✅ Monitor cron job runs (daily at midnight)
2. ✅ Set up error alerts for failed orders
3. ✅ Test messaging API in sandbox
4. ✅ Create approval URL endpoint
5. ✅ Integrate message sending into workflow

### Long-Term (Optimization)
1. ⏳ Set up Amazon Notifications API (webhooks)
2. ⏳ Upgrade to Vercel Pro for more frequent polling (if needed)
3. ⏳ Add approval tracking dashboard
4. ⏳ Automate approval → printing workflow

---

## Summary

**Current System:**
- ✅ Polling-based (once per day)
- ✅ Manual trigger available
- ✅ Processes orders automatically when cron runs
- ⚠️ 24-hour delay on free tier

**Customer Data:**
- ✅ Customization data always available
- ⚠️ Email/address require RDT or approved roles
- ⚠️ Phone number critical for Lulu API

**Messaging API:**
- ✅ Can send approval URLs to buyers
- ✅ Must be order-related
- ✅ Requires proper message formatting
- ✅ Test in sandbox first

**Next Test:**
1. Place test order
2. Manually trigger cron
3. Verify end-to-end flow works
4. Test messaging API with approval URL












