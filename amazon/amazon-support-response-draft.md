# Response to Amazon Support - confirmCustomizationDetails Implementation

**Date**: December 10, 2025  
**Order ID**: 111-0060602-1283417  
**Application ID**: amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58  
**Developer Account ID**: A2V719MRGLK48O

---

## Confirmation: Yes, we call confirmCustomizationDetails

Yes, we do call the `confirmCustomizationDetails` endpoint. This is our **preferred** messaging action for sending customization confirmation messages to customers.

---

## Implementation Flow

Our implementation follows this sequence:

### Step 1: Check Available Actions
We first call `GET /messaging/v1/orders/{amazonOrderId}` to determine which messaging actions are available for the order.

**Request Example:**
```
GET https://sellingpartnerapi-na.amazon.com/messaging/v1/orders/{amazonOrderId}?marketplaceIds=ATVPDKIKX0DER
```

**Response Handling:**
- We parse the `_links.actions` array from the response
- We check if `confirmCustomizationDetails` is available
- If available, we prefer it over other message types (like `createConfirmOrderDetails`)

### Step 2: Upload HTML Document (if using confirmCustomizationDetails)
Before sending the message, we upload an HTML document via the Uploads API (`POST /uploads/2020-11-25/uploadDestinations/messaging/v1`).

**Upload Details:**
- **Content Type**: `text/html; charset=UTF-8`
- **Encryption**: We use AES-256-GCM encryption as required by Amazon
- **Purpose**: The HTML document contains the customization preview message with styling

### Step 3: Send confirmCustomizationDetails Message
We then POST to `/messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails`.

**Request Details:**
- **Method**: `POST`
- **Path**: `/messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails`
- **Query Parameters**: `marketplaceIds=ATVPDKIKX0DER`
- **Request Body**:
  ```json
  {
    "attachments": [
      {
        "attachmentType": "CUSTOMIZATION_DETAILS",
        "contentType": "text/html; charset=UTF-8",
        "fileName": "{generated-filename}.html",
        "documentId": "{document-id-from-upload-step}"
      }
    ]
  }
  ```

**Expected Response:**
- **Status Code**: `201 Created`
- **Response Body**: Empty JSON object `{}` (or may contain `messageId`)

---

## Code Implementation

Our implementation is located in:
**File**: `back-end/src/lib/notifications/amazon-message-center.ts`

### Key Functions:

1. **`checkAvailableMessageTypes()`** (lines 290-362)
   - Calls `GET /messaging/v1/orders/{amazonOrderId}`
   - Parses available actions from `_links.actions`
   - Prefers `confirmCustomizationDetails` if available
   - Falls back to `createConfirmOrderDetails` if not available

2. **`sendConfirmCustomizationDetails()`** (lines 483-509)
   - Makes the POST request to `/messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails`
   - Includes the uploaded document ID in the attachments array
   - Handles the 201 response

3. **`uploadHtmlDocument()`** (lines 365-473)
   - Uploads HTML document via Uploads API
   - Handles encryption using AES-256-GCM
   - Returns document ID for use in the message

---

## Request/Response Examples

### GET Request (Check Available Actions)
**Request:**
```
GET /messaging/v1/orders/111-0060602-1283417?marketplaceIds=ATVPDKIKX0DER
```

**Response:** (Status 200)
The response includes `_links.actions` array with available message types, including `confirmCustomizationDetails` when available.

### POST Request (Send Message)
**Request:**
```
POST /messaging/v1/orders/111-0060602-1283417/messages/confirmCustomizationDetails?marketplaceIds=ATVPDKIKX0DER
Content-Type: application/json

{
  "attachments": [
    {
      "attachmentType": "CUSTOMIZATION_DETAILS",
      "contentType": "text/html; charset=UTF-8",
      "fileName": "customization-preview-initial.html",
      "documentId": "{uploaded-document-id}"
    }
  ]
}
```

**Response:** (Expected Status 201)
```json
{}
```

---

## When We Use confirmCustomizationDetails

We use `confirmCustomizationDetails` when:
1. ✅ The order is unshipped (this message type is only available for unshipped orders)
2. ✅ The action appears in the `_links.actions` array from the GET request
3. ✅ We need to send a customization preview to the customer

**Fallback Behavior:**
If `confirmCustomizationDetails` is not available (e.g., order is already shipped), we fall back to `createConfirmOrderDetails` which uses plain text instead of HTML attachments.

---

## Authentication & Signing

All requests are:
- ✅ Authenticated using LWA (Login with Amazon) access tokens
- ✅ Signed using AWS Signature Version 4 (SigV4)
- ✅ Include required headers: `x-amz-access-token`, `x-amz-date`, `host`
- ✅ Use proper AWS credentials (IAM Access Key ID and Secret Access Key)

---

## Error Handling

We handle the following scenarios:
- **403 Forbidden**: If `confirmCustomizationDetails` is not allowed for the order (e.g., order is shipped)
- **400 Bad Request**: If request body is invalid
- **401 Unauthorized**: If access token is expired or invalid
- **429 Too Many Requests**: Rate limiting (we implement retry logic)

When `confirmCustomizationDetails` is not available, we gracefully fall back to `createConfirmOrderDetails`.

---

## Logging & Debugging

We log full request/response details for support purposes, including:
- Full request headers and body
- Full response headers and body
- Request ID (`x-amzn-requestid`)
- Timestamps
- Application ID and Developer Account ID

These logs are available in our server logs and can be exported via our admin endpoint.

---

## Compliance

Our implementation:
- ✅ Follows Amazon's messaging API documentation
- ✅ Only sends order-related messages
- ✅ Uses proper message types as specified by Amazon
- ✅ Respects Amazon's messaging policies and restrictions
- ✅ Handles attachments according to Amazon's specifications

---

## Additional Information

**Use Case:**
We send customization confirmation messages to customers when their personalized book preview is ready for review. The HTML attachment contains a styled preview message with a link to approve or request revisions.

**Environment:**
- **Marketplace**: ATVPDKIKX0DER (US)
- **Region**: na (North America)
- **API Version**: v1

---

## Questions or Issues?

If you need any additional information about our implementation, please let us know. We're happy to provide:
- Additional request/response examples
- Code snippets from specific functions
- Log entries from actual API calls
- Any other technical details you require

Thank you for your assistance in troubleshooting this issue.




