# Response to Amazon Support - 403 Unauthorized Error

## Summary
We have completed all self-service troubleshooting steps and continue to receive 403 Unauthorized errors when attempting to use the Messaging API. We have verified our application configuration, roles, and authorization multiple times. Below is a summary of our troubleshooting efforts and the requested request/response details.

---

## Troubleshooting Steps Completed

### 1. Verified API Operation and Role Permissions ✅

**Steps Taken:**
1.1. Navigated to Seller Central → Solution Provider Portal → App & Services → "Develop apps"
1.2. Clicked "Edit App" to view the App Registration form
1.3. Verified the following roles are checked under the Roles section:
   - ✅ **Buyer Communication** (required for Messaging API)
   - ✅ Direct-to-Consumer (D2C)
   - ✅ Notifications

1.4. Reviewed role documentation at https://developer-docs.amazon.com/sp-api/docs/roles-in-the-selling-partner-api
   - Confirmed that "Buyer Communication" role is required for `/messaging/v1/orders` endpoint
   - Our application has this role enabled

**Result:** All required roles are present in our application configuration.

---

### 2. Verified Developer Profile and Re-Authorization ✅

**Steps Taken:**
2.1. Navigated to Developer Profile to verify role access
2.2. Confirmed "Buyer Communication" role is requested and approved in Developer Profile
2.3. Re-authorized the application multiple times:
   - Used the "Authorize app" button in Solution Provider Portal
   - Generated new Login with Amazon (LWA) Refresh Token after each authorization
   - Updated refresh token in our application configuration
   - Verified refresh token is valid and can be exchanged for access tokens

**Result:** Developer Profile has all required roles. Application has been re-authorized multiple times with new refresh tokens.

---

### 3. Verified Login with Amazon (LWA) Access Token ✅

**Steps Taken:**
3.1. Verified LWA access token exchange is successful:
   - Refresh token is valid
   - Access token is successfully obtained
   - Access token is included in `x-amz-access-token` header

3.2. Verified AWS Signature Version 4 (SigV4) signing:
   - AWS credentials (Access Key ID, Secret Access Key) are valid
   - Request signing is performed correctly
   - Signature is included in Authorization header

3.3. Verified request headers:
   - `host`: sellingpartnerapi-na.amazon.com
   - `x-amz-date`: Correctly formatted timestamp
   - `x-amz-access-token`: Valid access token from LWA exchange
   - `Authorization`: AWS SigV4 signature
   - `user-agent`: LittleHeroBooks/1.0 (Language=TypeScript/Node.js; Platform=Cloudflare)

**Result:** LWA access token exchange is successful. All required headers are present and correctly formatted.

---

## Current Status

Despite completing all troubleshooting steps, we continue to receive **403 Unauthorized** errors when attempting to:
- GET `/messaging/v1/orders/{orderId}`
- POST `/messaging/v1/orders/{orderId}/messages/confirmCustomizationDetails`
- POST `/messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails`

**Error Details:**
- Status Code: 403
- Status Text: Forbidden
- Error Message: "Access to requested resource is denied"

---

## Request/Response Details

Attached are the complete request and response details in the format you requested. We are providing examples from two different API operations to demonstrate that the 403 error occurs across multiple endpoints:

### Files Attached:

#### 1. Document Upload Endpoint (HTML Message Flow)
These files show the 403 error when attempting to upload a document for HTML-based messages:

- **amazon-request-111-0060602-1283417.txt** - Request to `/uploads/v1/documents`
  - Complete endpoint URL: `https://sellingpartnerapi-na.amazon.com/uploads/v1/documents`
  - All request headers (authorization, access token, date, etc.)
  - Request body (document metadata)
  - Request ID: `38e7eae4-6096-4ce0-a26f-1d7c3531a2ba`
  - Timestamp: `20251217T145856Z`

- **amazon-response-111-0060602-1283417.txt** - Response from `/uploads/v1/documents`
  - Status: 403 Forbidden
  - Error: "Access to requested resource is denied"
  - Error Type: `AccessDeniedException`
  - All response headers
  - Complete response body

#### 2. Text-Only Message Endpoint
These files show the 403 error when attempting to send a text-only message (no document upload):

- **amazon-request-text-111-0060602-1283417.txt** - Request to `/messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails`
  - Complete endpoint URL: `https://sellingpartnerapi-na.amazon.com/messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails`
  - All request headers
  - Request body (message content with URL)

- **amazon-response-text-111-0060602-1283417.txt** - Response from messaging endpoint
  - Status: 403 Forbidden
  - Error: "Access to requested resource is denied"
  - All response headers
  - Complete response body

### Metadata (Common to All Requests):
- **Application ID:** amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58
- **Developer Account ID:** A2V719MRGLK48O
- **API:** Selling Partner API
- **Order ID:** 111-0060602-1283417
- **Marketplace ID:** ATVPDKIKX0DER
- **Timestamps and Request IDs:** See individual files

---

## Additional Context

1. **Application Status:** Draft (as expected for private developers)
2. **Self-Authorization:** Completed multiple times via Solution Provider Portal
3. **OAuth Configuration:**
   - OAuth Login URI: https://littleherolabs.com/auth/amazon/login
   - OAuth Redirect URI: https://littleherolabs.com/auth/amazon/callback
4. **Environment:** Production (Cloudflare Pages)
5. **API Region:** North America (NA)

---

## Request for Assistance

We have exhausted all self-service troubleshooting options. The 403 error persists despite:
- Having all required roles enabled
- Re-authorizing the application multiple times
- Verifying LWA token exchange is successful
- Confirming request format matches API documentation

We request assistance in identifying what additional configuration or verification is needed to resolve this issue.

---

## Next Steps

Please review the attached request/response files and let us know:
1. If there are any issues with our request format or headers
2. If there are any additional configuration steps required
3. If there are any known issues with the Messaging API for private developers
4. Any other troubleshooting steps we should try

Thank you for your assistance.

---

---

## File Generation Instructions

The attached files were generated using our internal diagnostic endpoints. To regenerate or create additional files:

### Document Upload Endpoint Files (Already Generated):
- `amazon-request-111-0060602-1283417.txt` - Document upload request
- `amazon-response-111-0060602-1283417.txt` - Document upload response

### Text-Only Message Endpoint Files (To Generate):
Use the same endpoint with `textOnly=true` parameter to capture messaging API calls without document upload:

```bash
# Generate text-only message request/response files
curl "https://YOUR_BACKEND_URL/api/admin/amazon-support-response?orderId=111-0060602-1283417&textOnly=true&file=request" -o amazon-request-text-111-0060602-1283417.txt
curl "https://YOUR_BACKEND_URL/api/admin/amazon-support-response?orderId=111-0060602-1283417&textOnly=true&file=response" -o amazon-response-text-111-0060602-1283417.txt
```

**Note:** Replace `YOUR_BACKEND_URL` with your actual Cloudflare Pages admin URL. The `textOnly=true` parameter forces the endpoint to skip document upload and directly call the messaging API.

These files demonstrate that the 403 error occurs on both:
1. The document upload endpoint (`/uploads/v1/documents`) - **CORRECTED**: Should use `/uploads/2020-11-01/uploadDestinations/messaging` with query parameters (marketplaceIds, contentMD5, contentType) instead of body parameters
2. The messaging endpoint (`/messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails`) - for text-only messages

**Update (2025-12-17)**: Amazon Support confirmed the correct endpoint is `/uploads/2020-11-01/uploadDestinations/{resource}` where:
- `resource` = "messaging" (path parameter)
- `marketplaceIds` = query parameter (not body)
- `contentMD5` = query parameter (MD5 hash of content before encryption)
- `contentType` = optional query parameter

The implementation has been updated in `back-end/src/lib/notifications/amazon-message-center.ts`.

