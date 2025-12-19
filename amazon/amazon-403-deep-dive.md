# Deep Dive: 403 Unauthorized After All Steps Completed

If you've completed all authorization steps but still get 403, check these:

---

## 🔍 Additional Checks

### 1. Verify Order Belongs to Your Seller Account

**The order `111-0060602-1283417` might not belong to seller `A2V719MRGLK48O`**

**Check**:
1. Go to Amazon Seller Central → Orders
2. Search for order `111-0060602-1283417`
3. Verify it shows in your orders list
4. If it doesn't appear → That's the problem! The order belongs to a different seller

**Fix**: Use an order that actually belongs to your seller account

---

### 2. Verify AWS IAM Permissions Include Messaging API

**Your AWS IAM policy needs to allow messaging API calls**

**Check Your IAM Policy**:
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
        "arn:aws:execute-api:*:*:*/*/GET/messaging/v1/orders/*",
        "arn:aws:execute-api:*:*:*/*/POST/messaging/v1/orders/*/messages/*",
        "arn:aws:execute-api:*:*:*/*/POST/uploads/v1/documents"
      ]
    }
  ]
}
```

**Verify**:
1. Go to AWS Console → IAM → Users → `little-hero-labs-sp-api`
2. Check attached policies
3. Verify the policy includes `execute-api:Invoke` for messaging endpoints
4. If missing → Add the permissions above

---

### 3. Check Full Error Response from Server Logs

**The error response might have more details**

**Check Cloudflare Pages Logs**:
1. Go to Cloudflare Pages → Your Project → Logs
2. Search for: `[Amazon SP-API] Request failed`
3. Look for the full error response
4. Check for:
   - Specific error code
   - Error message details
   - Request ID
   - Any hints about what's missing

**Or use the export endpoint**:
```bash
curl "https://admin.littleherolabs.com/api/admin/amazon-support-response?orderId=111-0060602-1283417"
```

This will show the full request/response details.

---

### 4. Verify Order Status Allows Messaging

**Some order states don't allow messaging**

**Check Order Status**:
- ✅ **Unshipped** → Messaging allowed
- ❌ **Shipped** → Messaging may be restricted
- ❌ **Cancelled** → Messaging not allowed
- ❌ **Too old** → Messaging may expire

**Verify**:
1. Check order status in Seller Central
2. If shipped/cancelled → Try with a different, unshipped order

---

### 5. Check for Permission Propagation Delay

**Amazon's systems might need time to sync**

**Wait Time**:
- After enabling roles: 5-15 minutes
- After re-authorization: 5-15 minutes
- After updating refresh token: Immediate (but may need redeploy)

**Test**:
1. Wait 15-30 minutes after completing all steps
2. Try again
3. If still failing → Continue to next checks

---

### 6. Verify Application is in Production (Not Draft)

**Check Application Status**:

1. Go to: Seller Central → Apps & Services → Develop Apps
2. Find your app
3. Check status:
   - ✅ **"Authorized"** or **"Published"** → Good
   - ❌ **"Draft"** → Needs to be published/authorized
   - ❌ **"Pending"** → Wait for approval

---

### 7. Verify Seller ID Matches Authorized Account

**Mismatch between Seller ID and authorized account**

**Check**:
1. In Seller Central → Account Info
2. Verify your Seller ID is `A2V719MRGLK48O`
3. In Apps & Services → Manage Authorizations
4. Verify the app is authorized for `A2V719MRGLK48O`
5. In environment variables, verify `AMZ_SELLER_ID=A2V719MRGLK48O`

**If mismatch**: Update `AMZ_SELLER_ID` to match the authorized account

---

### 8. Try Fetching Order Details First

**Test if you can access the order at all**

**Test Order Access**:
```bash
# Try fetching order details (different endpoint)
curl "https://admin.littleherolabs.com/api/cron/amazon-orders"
```

**If this works**:
- ✅ Your credentials are valid
- ✅ You can access orders
- ❌ But messaging API is blocked → Likely a role/permission issue

**If this also fails**:
- ❌ Credentials or authorization issue
- ❌ Need to re-check all authorization steps

---

### 9. Contact Amazon Support

**If all above checks pass, contact Amazon**

**Provide**:
- Application ID: `amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58`
- Developer Account ID: `A2V719MRGLK48O`
- Order ID: `111-0060602-1283417`
- Error: `403 Unauthorized` on `GET /messaging/v1/orders/{orderId}`
- Request ID: (from error response)
- What you've done: Enabled Buyer Communication role, re-authorized app, got new refresh token
- Ask: "Why am I getting 403 Unauthorized when all permissions appear to be set correctly?"

---

## 🎯 Most Likely Issues (In Order)

1. **Order doesn't belong to your seller account** (60% likely)
2. **AWS IAM policy missing messaging permissions** (25% likely)
3. **Permission propagation delay** (10% likely)
4. **Order status doesn't allow messaging** (5% likely)

---

## ✅ Quick Test

**Try with a different order**:
1. Go to Seller Central → Orders
2. Find an **unshipped** order that definitely belongs to you
3. Test with that order ID instead

If that works → The original order doesn't belong to your account.

