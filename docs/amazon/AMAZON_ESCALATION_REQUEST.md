# Amazon SP-API Messaging API - Escalation Request

**Subject:** Request for Escalated Support - 403 Unauthorized Persists After Refresh Token Regeneration

**Date:** December 19, 2025

---

## Summary

We continue to receive 403 Unauthorized errors on all Messaging API endpoints despite following your recommendation to generate a new refresh token. The new refresh token successfully generates access tokens, but all API calls are still denied. We request escalated support to resolve this issue as we have been troubleshooting for multiple weeks without resolution.

---

## Application Details

- **Application ID:** `amzn1.sp.solution.3e928368-7705-40e7-806f-d9d25b42516c`
- **Client ID:** `amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58`
- **Developer Account ID:** `A2V719MRGLK48O`
- **Seller ID:** `A2V719MRGLK48O`
- **Application Type:** Private application
- **Application Status:** [Please confirm current status - Draft/Published/Live]

---

## Actions Taken Per Your Recommendation

### ✅ Step 1: Generated New Refresh Token
- **Date:** December 19, 2025
- **Action:** Re-authorized application in Solution Provider Portal
- **Result:** New refresh token generated successfully
- **Token Format:** `Atzr|IwEBIL6D621...` (332 characters, correct format)

### ✅ Step 2: Updated All Environment Variables
- Updated refresh token in all deployment environments
- Verified token is being used correctly by application
- Confirmed token format matches Amazon requirements

### ✅ Step 3: Verified Token Exchange Works
- **Test Result:** ✅ SUCCESS
- **Endpoint:** `POST https://api.amazon.com/auth/o2/token`
- **Response:** Access token generated successfully
- **Token Type:** `bearer`
- **Expires In:** `3600` seconds
- **Access Token Format:** `Atza|IwEBI...` (correct format)

---

## Current Problem: 403 Unauthorized on All API Calls

Despite successful access token generation, **ALL** Messaging API endpoints return 403 Unauthorized:

### Failed Endpoints:

1. **GET /messaging/v1/orders/{orderId}**
   - **Order ID Tested:** `112-7311035-1437035`
   - **Request ID:** `59274109-9a7c-4a6c-bcb6-3a2fce9ee5e1`
   - **Error:** `Access to requested resource is denied. (Code: Unauthorized)`
   - **Details Field:** Empty (no specific error details provided)

2. **POST /messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails**
   - **Order ID Tested:** `112-7311035-1437035`
   - **Request ID:** `59274109-9a7c-4a6c-bcb6-3a2fce9ee5e1`
   - **Error:** `Access to requested resource is denied. (Code: Unauthorized)`
   - **Details Field:** Empty

3. **POST /uploads/2020-11-01/uploadDestinations/messaging**
   - **Request ID:** `57cd2f7f-c6dd-40e1-b8fe-9a50a36c8456`
   - **Error:** `Access to requested resource is denied. (Code: Unauthorized)`
   - **Details Field:** Empty

---

## Diagnostic Test Results

We ran comprehensive diagnostics on December 19, 2025 at 14:49:02 UTC:

### ✅ Configuration Check: PASSED
- Client ID: Present and correct format
- Client Secret: Present (80 characters)
- Refresh Token: Present (332 characters, starts with `Atzr|`)
- AWS Credentials: Present and configured
- Seller ID: `A2V719MRGLK48O`

### ✅ LWA Access Token Generation: PASSED
- Token exchange successful
- Access token received: `Atza|IwEBI...`
- Token expires in: 3600 seconds
- Token type: `bearer`

### ❌ API Endpoint Access: FAILED
- All Messaging API endpoints return 403 Unauthorized
- Error details field is empty (no specific guidance)
- Request signing appears correct (AWS SigV4)
- All required headers present

---

## Technical Details

### Request Headers (Example from Failed Call):
```
authorization: AWS4-HMAC-SHA256 Credential=AKIA5SFMXGC43V3SXDND/20251219/us-east-1/execute-api/aws4_request, SignedHeaders=content-type;host;x-amz-access-token;x-amz-date, Signature=...
content-type: application/json
host: sellingpartnerapi-na.amazon.com
user-agent: LittleHeroBooks/1.0 (Language=TypeScript/Node.js; Platform=Cloudflare)
x-amz-access-token: Atza|IwEBI... (valid access token)
x-amz-date: 20251219T144835Z
```

### Application Roles (Verified in Solution Provider Portal):
- ✅ Buyer Communication
- ✅ Direct-to-Consumer (D2C)
- ✅ Notifications

### Developer Profile:
- ✅ Buyer Communication role requested and approved
- ✅ Application re-authorized multiple times

---

## Questions for Amazon Support

1. **Application Status:** What is the current status of our application? Is it "Draft", "Published", or "Live"? Does this affect API access?

2. **Authorization Delay:** Is there a delay after generating a new refresh token before permissions take effect? If so, how long?

3. **Role Verification:** Can you confirm on your end that the "Buyer Communication" role is properly enabled and active for our application?

4. **Order Eligibility:** Is order `112-7311035-1437035` eligible for messaging? Are there any order-specific restrictions?

5. **Error Details:** The error response includes an empty `details` field. Can you provide specific details about why access is being denied?

6. **Application Authorization:** Is our application fully authorized for the Messaging API, or is there an additional authorization step we're missing?

7. **Historical Context:** We successfully used the Messaging API on December 10, 2025. What changed between then and now that would cause this issue?

---

## Request for Escalation

We have been troubleshooting this issue for multiple weeks and have:
- ✅ Verified all application roles and permissions
- ✅ Re-authorized the application multiple times
- ✅ Generated new refresh tokens as recommended
- ✅ Confirmed token exchange works correctly
- ✅ Verified request signing and headers are correct
- ✅ Tested with multiple orders

Despite all these steps, we continue to receive 403 Unauthorized errors with no specific error details to guide us.

**We request escalated support** to:
1. Review our application configuration on Amazon's side
2. Verify authorization status and permissions
3. Provide specific guidance on what is causing the 403 errors
4. Help us understand what additional steps (if any) are required

---

## Test Endpoints Available

If you need to test our implementation, we have diagnostic endpoints available:
- `GET /api/admin/test-amazon-messaging?orderId=112-7311035-1437035` - Full diagnostics
- `GET /api/admin/test-order-message?orderId=112-7311035-1437035` - Message sending test

---

## Contact Information

- **Developer Account:** A2V719MRGLK48O
- **Application:** Little Hero Books
- **Support Case:** [Previous case reference if applicable]

---

Thank you for your assistance. We look forward to resolving this issue with your help.

