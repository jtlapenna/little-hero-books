# Issue: Audit and Fix Amazon Messaging Feature

**Status:** 🟢 Resolved (text-only path)  
**Priority:** High  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-29

## Description

Amazon messaging feature is currently failing with "Access to requested resource is denied. (Code: Unauthorized)" error. Need to audit the entire Amazon messaging system and fix authorization/configuration issues.

## Impact

- **Customer notifications not sending** - customers not receiving preview links
- **Manual workaround required** - must copy/paste preview links manually
- **Customer experience degraded** - no automated communication
- **Operational overhead** - manual notification process

## Current Error

```
Access to requested resource is denied. (Code: Unauthorized)
```

This indicates Amazon SP-API is rejecting the request due to authentication/authorization issues.

## Potential Root Causes

1. **LWA (Login with Amazon) credentials:**
   - Invalid or expired `AMZ_REFRESH_TOKEN`
   - Wrong `AMZ_APP_CLIENT_ID` / `AMZ_APP_CLIENT_SECRET`
   - App not authorized for seller account
   - Token refresh failing

2. **AWS IAM credentials:**
   - Invalid `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
   - Wrong IAM user/role (not authorized for SP-API)
   - Missing `AWS_SESSION_TOKEN` (if using temporary credentials)
   - Wrong AWS region

3. **Seller/App mismatch:**
   - `AMZ_SELLER_ID` doesn't match order's seller
   - App not authorized for this seller account
   - Marketplace mismatch

4. **API permissions:**
   - SP-API app missing "Messaging" permissions
   - IAM role missing `execute-api` permissions
   - Seller account restrictions

5. **Environment configuration:**
   - Wrong environment variables in production
   - Sandbox vs production mismatch
   - Missing required env vars

## Affected Files

- `back-end/src/lib/notifications/amazon-message-center.ts` (core messaging logic)
- `back-end/src/app/api/orders/[orderId]/final-approval/route.ts` (sends message)
- `back-end/src/app/api/admin/send-amazon-message/route.ts` (test endpoint)
- `back-end/src/app/api/admin/check-amazon-messaging/route.ts` (diagnostic endpoint)
- Environment variables (Vercel/production)

## Investigation Steps

1. **Check configuration:**
   - Call `/api/admin/check-amazon-messaging` endpoint
   - Verify all required env vars are set
   - Check for masked values (confirm they're not empty)

2. **Review Amazon request details:**
   - Get `requestId` from failed request (Network tab or logs)
   - Check full request/response in Vercel logs
   - Look for specific error codes/messages from Amazon

3. **Verify credentials:**
   - Test LWA token refresh manually
   - Verify AWS credentials are valid
   - Check seller/app authorization in Amazon Seller Central

4. **Check API permissions:**
   - Verify SP-API app has Messaging permissions
   - Check IAM role has execute-api permissions
   - Review seller account restrictions

5. **Test message types:**
   - Check which message types are available for order
   - Verify `confirmCustomizationDetails` vs `confirmOrderDetails` logic
   - Test with different order states

## Diagnostic Endpoints Available

- `GET /api/admin/check-amazon-messaging` - Configuration check
- `GET /api/admin/send-amazon-message?orderId=...` - Test send
- `POST /api/orders/[orderId]/final-approval` - Production send (with notification result)

## Proposed Fix Steps

1. **Verify credentials:**
   - Check all Amazon env vars in Vercel
   - Test LWA token refresh
   - Verify AWS IAM credentials

2. **Check authorization:**
   - Verify app is authorized for seller account
   - Check SP-API permissions in Amazon Developer Console
   - Verify IAM role permissions

3. **Test with diagnostic endpoint:**
   - Use `/api/admin/check-amazon-messaging` to verify config
   - Use `/api/admin/send-amazon-message` to test sending
   - Review full error details

4. **Fix configuration:**
   - Update incorrect env vars
   - Re-authorize app if needed
   - Fix IAM permissions if needed

5. **Add better error handling:**
   - More specific error messages
   - Better logging of auth failures
   - Clearer user-facing error messages

## Related Files

- `back-end/src/lib/notifications/amazon-message-center.ts` - Full implementation
- Environment variables documentation (if exists)
- Amazon SP-API setup documentation

## Notes

- Error is "Unauthorized" - this is an auth/configuration issue, not a code bug
- Need Amazon request ID from failed call for Amazon support (if needed)
- May need to re-authorize app or update credentials
- Check if this worked before and what changed

## Success Criteria

- [x] `/api/admin/check-amazon-messaging` shows all config valid
- [x] Test message sends successfully (curl to send-amazon-message: `success: true`, `messageType: createConfirmOrderDetails`, order 111-9459631-7176256)
- [ ] Production "Send for Customer Approval" button works (test from order detail page with real preview URL)
- [ ] UI shows "Preview link sent via Amazon Message Center" (not error)
- [ ] `notification_logs` shows `status='sent'` with `messageId`

**Fix applied:** Default to text-only messaging (no HTML upload). Set `AMAZON_FORCE_TEXT_ONLY=false` in Vercel only if you later get Uploads API permission and want HTML messages.

---

## Next Steps for Troubleshooting (using 2 unshipped orders)

Use your **2 new orders that have not yet shipped** for testing. Unshipped orders are ideal because:
- They are real Amazon order IDs for your seller account
- Messaging is typically available before shipment (Amazon may restrict after ship)
- You avoid marketplace/seller mismatch issues

### Step 1: Verify config (production) ✅ Done

1. Open (with auth if required):  
   `https://admin.littleherolabs.com/api/admin/check-amazon-messaging`
2. Confirm `configured: true` and all required env vars show as SET.
3. If `configured: false`, fix the listed `missingFields` in Vercel → Project → Settings → Environment Variables (Production), then redeploy.

**Note:** Config check returned `configured: true`, `notificationsEnabled: true`. **AMAZON_SANDBOX_MODE** is set to `true` in production. The messaging module always calls **production** SP-API (it does not use sandbox). If you still get Unauthorized, consider setting `AMAZON_SANDBOX_MODE=false` in production for consistency (the cron/orders API uses it for order ingestion; messaging is production-only).

### Step 2: Get the 2 unshipped order IDs

- Use your DB or admin UI to get the **Amazon order IDs** (e.g. `112-xxxxx-xxxxx`) for the 2 orders that have not shipped.
- Ensure these are the same marketplace you use for SP-API (e.g. US / ATVPDKIKX0DER).

**Unshipped orders (from Seller Central):**
| Order ID | Buyer   | Order date   |
|----------|---------|--------------|
| `111-9459631-7176256` | Marianna | 2 days ago   |
| `112-0573468-3658621` | Kim      | 16 hours ago |

### Step 3: Test send with first order

1. Build a test URL (this endpoint does **not** require auth — no token or cookie needed):
   ```
   GET https://admin.littleherolabs.com/api/admin/send-amazon-message?orderId=111-9459631-7176256&previewUrl=https://littleherolabs.com/approve/test-token&childName=Test
   ```
2. Call it in a browser or with curl (no `Authorization` header required).
3. Check the JSON response:
   - If **success: true** → messaging works; then test "Send for Customer Approval" from the order detail page for that order.
   - If **success: false** with "Unauthorized" (or 403):
     - In the response, use **requestId** and **apiCallDetails** (see Step 4) for Amazon support.
     - Double-check: LWA refresh token, AWS IAM credentials, seller ID, and that the SP-API app has **Messaging** permissions in Seller Central / Developer Console.

### Step 4: Capture details for Amazon support (when Unauthorized)

- The test endpoint now returns **requestId** and **apiCallDetails** on failure. Use these when opening an Amazon SP-API support case:
  - **Request ID** (from response or `apiCallDetails.requestId`)
  - **Operation** (e.g. `GET /messaging/v1/orders/...`)
  - **Timestamp**, **applicationId**, **developerAccountId**
- Optionally copy the full `apiCallDetails` from the JSON response (redact any sensitive headers if sharing externally).

### Step 5: If config is valid but still Unauthorized

- **LWA:** Confirm `AMZ_REFRESH_TOKEN` is for the correct seller and app; re-authorize in Seller Central if needed.
- **IAM:** Confirm the IAM user/role has `execute-api:Invoke` for the SP-API endpoint and is the same identity used in the SP-API app registration.
- **Messaging role:** In Amazon Developer Console / Seller Central, ensure the app has **Messaging** (and any required Messaging sub-types) enabled for the seller account.
- Open a support case with Amazon with the **requestId** and operation details from Step 4.

---

## Test result: Unauthorized (order 111-9459631-7176256)

**Response:** `{"success":false,"error":"Access to requested resource is denied. (Code: Unauthorized)"}` (then after deploy, full response with `requestId` and `apiCallDetails`).

**Root cause (from apiCallDetails):** The failure is **not** on the Messaging GET-orders call. It is on:
- **Operation:** `POST /uploads/2020-11-01/uploadDestinations/messaging`
- **Request ID:** `7fef5899-934c-4512-8b5d-2e7f4cf0c5c6`
- **Response:** 403, `x-amzn-errortype: AccessDeniedException`, code `Unauthorized`

So: **LWA and GET /messaging/v1/orders/... succeed**; the **Uploads API** (requesting an upload destination for the HTML message) is denying access. The app likely has Messaging permission but not **Uploads** (or the IAM user lacks execute-api on the uploads endpoint).

### Next steps

**Option A – Workaround (text-only message, no HTML upload)**  
Set in Vercel (Production): `AMAZON_FORCE_TEXT_ONLY=true`.  
The code will use `createConfirmOrderDetails` (plain text with preview URL) and **skip** the Uploads API call. Customers still get the preview link; the email body is text-only. Redeploy and re-run the curl; if Messaging is allowed, it should succeed.

**Option B – Proper fix (keep HTML messages)**  
1. In Amazon Developer Console → your SP-API app → ensure **Uploads** API (or the scope that includes `uploadDestinations/messaging`) is enabled and that the seller (A2V719MRGLK48O) is authorized.  
2. Ensure the IAM user (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) has `execute-api:Invoke` on the **Uploads** API Gateway for your app (same registration as Messaging).  
3. Open an SP-API support case with **Request ID** `7fef5899-934c-4512-8b5d-2e7f4cf0c5c6`, **operation** `POST /uploads/2020-11-01/uploadDestinations/messaging`, and ask them to confirm your app has Uploads access for messaging for seller A2V719MRGLK48O.

**Vercel Logs note:** The main Logs table (Time, Status, Host, Request, Messages) often does **not** show function-level `console.log` (e.g. `[Amazon SP-API]`). That’s a Vercel UI limitation. You don’t need the logs for this issue: the **API response** now includes `requestId` and `apiCallDetails`, which is enough for support and debugging.
