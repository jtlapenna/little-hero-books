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
