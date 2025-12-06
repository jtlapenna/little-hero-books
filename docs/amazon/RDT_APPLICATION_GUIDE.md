# RDT (Restricted Data Token) Application Guide

## What is RDT?

**RDT = Restricted Data Token**

RDT allows you to access **Personally Identifiable Information (PII)** from Amazon orders:
- Customer email address
- Customer name
- **Shipping address** (CRITICAL for FBM fulfillment)
- Phone number (CRITICAL for Lulu API)
- Tax information

## Why You Need RDT for FBM

**FBM (Fulfilled by Merchant)** means **YOU** are responsible for shipping the product to the customer. Amazon does NOT provide shipping addresses without RDT approval.

**Without RDT:**
- ❌ Cannot get shipping address from Amazon
- ❌ Cannot fulfill orders (no address to ship to)
- ❌ Cannot submit to Lulu (Lulu requires shipping address)

**With RDT:**
- ✅ Can access full shipping address
- ✅ Can fulfill orders via Lulu or other POD services
- ✅ Can send customer communications

## How to Check Your Current RDT Status

### Method 1: Check SP-API App Dashboard

1. Go to [Amazon Developer Console](https://developer.amazon.com/)
2. Navigate to **Apps & Services** → **Your SP-API Applications**
3. Select your SP-API application
4. Look for **"Restricted Roles"** or **"Restricted Data Access"** section
5. Check status:
   - ✅ **Approved**: You have RDT access
   - ⏳ **Pending**: Application under review
   - ❌ **Not Applied**: Need to request

### Method 2: Test API Endpoints

Try calling the buyer info or address endpoints:

```bash
# Test buyer info endpoint (requires RDT)
curl -X GET "https://sellingpartnerapi-na.amazon.com/orders/v0/orders/{orderId}/buyerInfo" \
  -H "x-amz-access-token: YOUR_ACCESS_TOKEN" \
  -H "x-amz-date: $(date -u +%Y%m%dT%H%M%SZ)"

# Test address endpoint (requires RDT)
curl -X GET "https://sellingpartnerapi-na.amazon.com/orders/v0/orders/{orderId}/address" \
  -H "x-amz-access-token: YOUR_ACCESS_TOKEN" \
  -H "x-amz-date: $(date -u +%Y%m%dT%H%M%SZ)"
```

**Response Codes:**
- `200 OK`: ✅ RDT is working
- `403 Forbidden`: ❌ RDT not approved or not requested
- `401 Unauthorized`: Authentication issue (different problem)

### Method 3: Check Your Code Logs

Look for 403 errors when fetching buyer info or address:

```javascript
// In your middleware logs, look for:
"[Amazon Middleware] Could not fetch buyer info: 403 Forbidden"
"[Amazon Middleware] Could not fetch address: 403 Forbidden"
```

## How to Apply for RDT

### Step 1: Request Restricted Roles in SP-API App

1. **Go to Amazon Developer Console**
   - URL: https://developer.amazon.com/
   - Login with your Seller Central account

2. **Navigate to Your SP-API Application**
   - Go to **Apps & Services** → **Your SP-API Applications**
   - Select your application

3. **Request Restricted Roles**
   - Look for **"Restricted Roles"** or **"Restricted Data Access"** section
   - Click **"Request Restricted Roles"** or **"Apply for Restricted Data Access"**

4. **Fill Out Application Form**
   - **Business Justification**: Explain why you need PII access
     - Example: "We fulfill orders directly (FBM) and need shipping addresses to ship products to customers via print-on-demand services (Lulu)."
   - **Use Case**: Describe how you'll use the data
     - Example: "We use shipping addresses to fulfill orders through our print-on-demand partner (Lulu). We also use customer email to send order approval links via Amazon Messaging API."
   - **Data Handling**: Explain how you protect customer data
     - Example: "Customer data is stored securely in Supabase (encrypted at rest) and only used for order fulfillment. We do not share customer data with third parties except our fulfillment partner (Lulu) for shipping purposes."

5. **Submit Application**
   - Amazon will review your application
   - Review typically takes **7-14 business days**
   - You'll receive email notifications about status

### Step 2: Required Restricted Roles

You'll need to request these roles:

1. **`sellingpartnerapi::mfn`** (Merchant Fulfilled Network)
   - Required for FBM sellers
   - Allows access to shipping addresses for orders you fulfill

2. **`sellingpartnerapi::notifications`** (Optional but recommended)
   - For order notifications
   - Not strictly required for RDT but useful

### Step 3: After Approval

Once approved:

1. **Update Your Code** (if needed)
   - Your existing code should work automatically
   - The SP-API will return RDT tokens when calling PII endpoints
   - No code changes needed if using standard SP-API SDK

2. **Test the Endpoints**
   - Try fetching buyer info and address for a test order
   - Verify you get 200 OK responses instead of 403

3. **Update Your Workflow**
   - Shipping addresses will now be available in your database
   - Workflow 4 (Lulu submission) will work automatically

## FBM vs FBA: Shipping Address Access

### FBA (Fulfilled by Amazon)
- Amazon handles shipping
- You **don't need** shipping addresses
- Amazon ships directly to customers
- **RDT not required** for fulfillment (but still useful for customer communication)

### FBM (Fulfilled by Merchant) - YOUR CASE
- **YOU** handle shipping
- **MUST have** shipping addresses
- You ship via Lulu or other POD services
- **RDT REQUIRED** - Cannot fulfill without it

## What Happens Without RDT (FBM)

If you're FBM and don't have RDT:

1. **Order comes in from Amazon**
   - ✅ You get order ID, product info, customization data
   - ❌ Shipping address is `null` or incomplete

2. **Order stored in database**
   - `shipping_address: null` or incomplete

3. **Workflow 4 tries to submit to Lulu**
   - ❌ **FAILS** - Lulu requires complete shipping address
   - Error: "Missing shipping address" or "Invalid shipping address"

4. **Order stuck**
   - Cannot fulfill
   - Must manually add shipping address
   - Or wait for RDT approval

## Temporary Workaround (While Waiting for RDT)

If you need to fulfill orders before RDT is approved:

1. **Manual Address Entry**
   - Flag orders missing shipping addresses in admin UI
   - Manually add shipping address from Amazon Seller Central
   - Then run Workflow 4

2. **Amazon Seller Central**
   - Go to Orders → Manage Orders
   - Find the order
   - Copy shipping address manually
   - Add to your database via admin UI

3. **Automate Manual Entry** (if possible)
   - Create admin UI form to add shipping addresses
   - Link to Amazon Seller Central order page
   - Copy-paste address into form

## Application Tips

### Strong Business Justification Example

> "We operate as a Merchant Fulfilled Network (FBM) seller for personalized children's books. Each order requires custom printing and fulfillment through our print-on-demand partner (Lulu). To fulfill orders, we require:
> 
> 1. **Shipping Address**: Required to ship printed books to customers via Lulu's fulfillment network
> 2. **Phone Number**: Required by Lulu API for shipping validation
> 3. **Customer Email**: Used to send order approval links via Amazon Messaging API (compliant with Amazon communication policies)
> 
> We store customer data securely in Supabase (encrypted at rest) and only share shipping information with Lulu for fulfillment purposes. We do not use customer data for marketing or share with third parties."

### Data Protection Statement

> "Customer PII is:
> - Stored in Supabase (SOC 2 compliant, encrypted at rest)
> - Only accessed via secure API endpoints
> - Only shared with Lulu (our fulfillment partner) for shipping
> - Deleted after order fulfillment is complete (per GDPR requirements)
> - Never used for marketing or shared with third parties"

## Checking Application Status

After submitting:

1. **Check Email**
   - Amazon will email you about application status
   - Check spam folder if you don't see it

2. **Check Developer Console**
   - Go to your SP-API app
   - Look for status updates in "Restricted Roles" section

3. **Check Seller Central**
   - Sometimes notifications appear in Seller Central
   - Go to Settings → Account Info → API Access

## Next Steps After Approval

1. ✅ Test buyer info endpoint
2. ✅ Test address endpoint  
3. ✅ Verify shipping addresses are stored in database
4. ✅ Test Workflow 4 (Lulu submission)
5. ✅ Monitor for any 403 errors

## Support Resources

- **Amazon SP-API Documentation**: https://developer-docs.amazon.com/sp-api/
- **RDT Documentation**: https://developer-docs.amazon.com/sp-api/docs/restricted-data-tokens-api-v2021-03-01-reference
- **Amazon Seller Forums**: https://sellercentral.amazon.com/forums
- **SP-API Support**: Submit case via Seller Central

## Current Status Checklist

- [ ] Checked SP-API app for restricted roles status
- [ ] Tested buyer info endpoint (check for 403)
- [ ] Tested address endpoint (check for 403)
- [ ] Reviewed application requirements
- [ ] Prepared business justification
- [ ] Submitted RDT application
- [ ] Waiting for approval (7-14 days)
- [ ] Tested endpoints after approval
- [ ] Verified shipping addresses in database
- [ ] Tested Workflow 4 with real address

