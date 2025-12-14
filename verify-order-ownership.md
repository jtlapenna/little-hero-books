# Verify Order Ownership - Quick Test

## The Problem

You're getting `403 Unauthorized` on order `111-0060602-1283417`. This usually means:
- ❌ The order doesn't belong to seller `A2V719MRGLK48O`
- ❌ Or there's an authorization issue

## Quick Test: Verify Order Ownership

### Method 1: Check in Seller Central (Easiest)

1. **Go to**: Amazon Seller Central → Orders
   - URL: https://sellercentral.amazon.com/orders-v3
2. **Search for**: `111-0060602-1283417`
3. **Check**:
   - ✅ **If order appears** → Order belongs to you, issue is authorization
   - ❌ **If order doesn't appear** → Order belongs to different seller (THIS IS THE PROBLEM)

### Method 2: Try Fetching Order Details via API

Test if you can access the order at all:

```bash
# This tests if you can fetch orders (different endpoint)
curl "https://admin.littleherolabs.com/api/cron/amazon-orders"
```

**Results**:
- ✅ **If this works** → Your credentials are valid, but messaging API is blocked
- ❌ **If this also fails** → Credentials or authorization issue

### Method 3: Check Order in Supabase

The order exists in your Supabase database, but that doesn't mean it belongs to your Amazon seller account.

**Check**:
1. Look at the order in your admin panel
2. Check the `seller_id` or `amazon_seller_id` field
3. Verify it matches `A2V719MRGLK48O`

---

## Most Likely Scenario

**The order `111-0060602-1283417` was likely:**
- Created during testing with a different seller account
- Or imported from a different source
- Or belongs to a different marketplace/seller

**Solution**: Use an order that **definitely** belongs to your seller account.

---

## How to Get a Valid Test Order

### Option 1: Place a Real Test Order

1. **Go to**: Your Amazon Custom listing (if you have one)
2. **Place a small test order** (buy from yourself)
3. **Use that order ID** for testing

### Option 2: Use an Order from Your Orders List

1. **Go to**: Seller Central → Orders
2. **Find**: Any **unshipped** order that belongs to you
3. **Copy the order ID**
4. **Test with that order ID**:
   ```bash
   curl "https://admin.littleherolabs.com/api/admin/test-amazon-messaging?orderId=YOUR-ORDER-ID"
   ```

### Option 3: Check Recent Orders

If you have the cron job running:
1. **Check**: `/api/orders` endpoint
2. **Find**: Orders that were fetched from Amazon
3. **Use one of those order IDs** for testing

---

## If Order Does Belong to You

If the order appears in Seller Central but you still get 403:

1. **Check Application Authorization**:
   - Go to: Apps & Services → Manage Authorizations
   - Verify app is authorized for seller `A2V719MRGLK48O`
   - Re-authorize if needed

2. **Check Buyer Communication Role**:
   - Go to: Developer Profile
   - Verify "Buyer Communication" is active
   - Wait 15-30 minutes after enabling

3. **Check Order Status**:
   - If order is **shipped** → Messaging may be blocked
   - If order is **cancelled** → Messaging not allowed
   - Need **unshipped** order for messaging

4. **Contact Amazon Support**:
   - Provide Application ID
   - Provide Order ID
   - Explain you've completed all authorization steps
   - Ask why you're getting 403

---

## Quick Verification Checklist

- [ ] Order `111-0060602-1283417` appears in Seller Central Orders
- [ ] Order status is "Unshipped" (not Shipped/Cancelled)
- [ ] Order belongs to seller `A2V719MRGLK48O`
- [ ] Application is authorized for seller `A2V719MRGLK48O`
- [ ] Buyer Communication role is active
- [ ] IAM policy updated (if you did that)
- [ ] Waited 15-30 minutes after authorization changes

---

## Next Steps

1. **First**: Verify order ownership in Seller Central
2. **If order doesn't belong to you**: Get a valid order ID
3. **If order does belong to you**: Contact Amazon Support with details

The 403 error will persist until you use an order that belongs to your seller account, OR until Amazon resolves the authorization issue.

