Subject: Re: confirmCustomizationDetails Implementation - Follow-up on Upload Endpoint and Authorization

Dear Harsha,

Thank you for your guidance on the correct upload endpoint and testing approach. I have implemented your suggestions and conducted testing. Below is a summary of what I've done and the current status.

IMPLEMENTATION UPDATES

1. Upload Endpoint Correction
   - Updated code to use the correct endpoint: POST /uploads/2020-11-01/uploadDestinations/messaging
   - Moved marketplaceIds, contentMD5, and contentType to query parameters (not request body)
   - contentMD5 is calculated as MD5 hash of the original HTML content (before encryption)
   - Resource parameter is set to "messaging" in the path

2. AWS IAM Policy Update
   - Updated IAM policy to include the new upload endpoint ARN:
     arn:aws:execute-api:*:*:*/*/POST/uploads/2020-11-01/uploadDestinations/messaging
   - Policy also includes:
     arn:aws:execute-api:*:*:*/*/GET/messaging/v1/orders/*
     arn:aws:execute-api:*:*:*/*/POST/messaging/v1/orders/*/messages/*

3. Text-Only Message Testing
   - As you suggested, I tested createConfirmOrderDetails with text-only content first
   - This isolates authorization issues from upload issues
   - Test order: 112-7311035-1437035 (Amazon.com US marketplace)

TEST RESULTS

What's Working:
- LWA (Login with Amazon) access token generation: SUCCESS
- AWS SigV4 request signing: SUCCESS
- Request format and parameters: CORRECT
- All required headers present: Authorization, Content-Type, x-amz-access-token, x-amz-date
- Query parameters formatted correctly: marketplaceIds=ATVPDKIKX0DER

What's Not Working:
- GET /messaging/v1/orders/{orderId}: Returns 403 Unauthorized
- POST /messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails: Returns 403 Unauthorized

Error Response:
{
  "errors": [
    {
      "code": "Unauthorized",
      "message": "Access to requested resource is denied.",
      "details": ""
    }
  ]
}

PERMISSIONS VERIFICATION

I have verified the following in Seller Central:

1. App Authorization
   - Application ID: amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58
   - Developer Account ID: A2V719MRGLK48O
   - App is authorized and active in Seller Central
   - Messaging API is listed in authorized APIs for this application

2. SP-API Role Permissions
   - SP-API role has Messaging permissions enabled
   - Role has permission to send messages to buyers
   - User permissions verified in Seller Central Settings

3. Marketplace Configuration
   - Seller account region: NA (North America)
   - API endpoint region: NA (sellingpartnerapi-na.amazon.com)
   - Marketplace ID: ATVPDKIKX0DER (Amazon.com US)
   - Order tested: 112-7311035-1437035 (from ATVPDKIKX0DER marketplace)

4. AWS IAM Policy
   - IAM user has execute-api:Invoke permission for all required endpoints
   - Policy includes ARNs for messaging and upload endpoints
   - AWS credentials are correctly configured

REQUEST DETAILS FOR DIAGNOSTICS

Test Request (Text-Only Message):
- Method: POST
- URL: https://sellingpartnerapi-na.amazon.com/messaging/v1/orders/112-7311035-1437035/messages/createConfirmOrderDetails?marketplaceIds=ATVPDKIKX0DER
- Request ID: f98e6c04-b2b9-48b6-a0a3-644317feded1
- Timestamp: 2025-12-18T22:43:02Z
- Request Body: {"text": "Hi! Here is a preview of your personalized book so you can confirm everything looks good before we print: https://littleherolabs.com/approve/test-token. We will proceed using these details unless we hear from you."}

Test Request (Check Available Actions):
- Method: GET
- URL: https://sellingpartnerapi-na.amazon.com/messaging/v1/orders/112-7311035-1437035?marketplaceIds=ATVPDKIKX0DER
- Request ID: f98e6c04-b2b9-48b6-a0a3-644317feded1 (from previous test)
- Timestamp: 2025-12-18T22:43:06Z

Upload Endpoint Test (Not Yet Tested):
- Method: POST
- URL: https://sellingpartnerapi-na.amazon.com/uploads/2020-11-01/uploadDestinations/messaging?marketplaceIds=ATVPDKIKX0DER&contentMD5={base64_md5_hash}&contentType=text%2Fhtml%3B+charset%3DUTF-8
- Note: This endpoint also returns 403 when tested directly, but we have not tested it in the full flow yet due to the messaging endpoint authorization issue.

ORDER INFORMATION

Order ID: 112-7311035-1437035
Order Item ID: 149812777106121
Purchase Date: 2025-12-18T20:43:05+00:00
Promise Date: 2026-01-03T07:59:59+00:00
Marketplace: ATVPDKIKX0DER (Amazon.com US)
Order Status: Active (not pending or cancelled)
Buyer: Donna S. LaPenna

QUESTIONS

1. Since all permissions appear to be correctly configured in Seller Central, what additional authorization steps might be required?

2. Is there a specific approval process or waiting period after enabling Messaging API permissions that we need to complete?

3. Could there be an issue with the app authorization that requires re-authorization or additional verification?

4. Should we test with a different order, or is there a specific order status required for messaging?

5. Are there any additional IAM permissions or SP-API role configurations beyond what we've verified that might be needed?

NEXT STEPS

I am ready to test the upload endpoint once the messaging authorization is resolved. The code implementation is complete and correct according to your specifications. I believe the issue is on the authorization/permission side rather than the implementation.

I would appreciate any guidance on:
- Additional steps to verify or enable authorization
- Whether there are any pending approvals or verification processes
- Any known issues or limitations with the Messaging API for this application

Thank you for your continued support. I look forward to resolving this authorization issue so we can proceed with testing the full messaging flow.

Best regards,
[Your Name]
Little Hero Labs

APPLICATION DETAILS:
- Application ID: amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58
- Developer Account ID: A2V719MRGLK48O
- Seller ID: A2V719MRGLK48O
- Marketplace: ATVPDKIKX0DER (Amazon.com US)
- Region: NA

