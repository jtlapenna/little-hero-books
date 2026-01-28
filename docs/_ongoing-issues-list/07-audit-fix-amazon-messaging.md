# Issue: Audit and Fix Amazon Messaging Feature

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

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

- [ ] `/api/admin/check-amazon-messaging` shows all config valid
- [ ] Test message sends successfully
- [ ] Production "Send for Customer Approval" button works
- [ ] UI shows "Preview link sent via Amazon Message Center" (not error)
- [ ] `notification_logs` shows `status='sent'` with `messageId`

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

**Response:** `{"success":false,"error":"Access to requested resource is denied. (Code: Unauthorized)"}`

This indicates Amazon SP-API is rejecting the **Messaging** request (likely the first call: `GET /messaging/v1/orders/{orderId}`). The error is from Amazon, not from missing config.

### Next steps

1. **Get Request ID from Vercel logs**  
   After redeploying (so future responses include `requestId` and `apiCallDetails`), run the test again and check the JSON response. Or **now**: Vercel → Project → Logs (or Function logs). Find the log entry for the request; look for:
   - `[Amazon SP-API] Request failed - FULL DETAILS:` or  
   - `[Amazon SP-API] Full Request/Response Details for Support:`  
   Copy the **requestId** and (if present) **operation** from that log. You need the requestId for an Amazon support case.

2. **Verify production credentials**
   - **LWA:** In Vercel (Production), ensure `AMZ_APP_CLIENT_ID`, `AMZ_APP_CLIENT_SECRET`, and `AMZ_REFRESH_TOKEN` are the **production** app and token (not sandbox). Your `.env.local` has separate `AMZ_LWA_CLIENT_ID_PROD` / `AMZ_APP_PROD_REFRESH_TOKEN`; production must use the same values as your prod LWA app.
   - **IAM:** The `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in Vercel must be for an IAM user/role that is **authorized for SP-API** in the same app registration (Developer Console). That identity must have `execute-api:Invoke` on the SP-API API Gateway.

3. **Messaging permission**
   - In Amazon Developer Console → your SP-API app → check that **Messaging** (and any required Messaging sub-types) are enabled and that the seller account (A2V719MRGLK48O) is authorized for this app.

4. **Open an Amazon SP-API support case**
   - Include: **Request ID** from logs, **operation** (e.g. `GET /messaging/v1/orders/111-9459631-7176256`), **application ID** (your LWA client ID), **seller ID** (A2V719MRGLK48O), and that you get "Access to requested resource is denied (Code: Unauthorized)" when calling the Messaging API. Ask them to confirm your app has Messaging access for that seller and that the IAM credentials are correctly linked.
