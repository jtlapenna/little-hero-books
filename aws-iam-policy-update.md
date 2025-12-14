# AWS IAM Policy Update for Messaging API

## Current Policy (May Be Too Broad)

Your current policy:
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
        "arn:aws:execute-api:*:*:*/*/messaging/*",
        "arn:aws:execute-api:*:*:*/*/uploads/*"
      ]
    }
  ]
}
```

## Recommended Policy (More Specific)

Update to this for better compatibility:
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
        "arn:aws:execute-api:*:*:*/*/POST/uploads/v1/documents",
        "arn:aws:execute-api:*:*:*/*/POST/uploads/2020-11-25/uploadDestinations/messaging/v1"
      ]
    }
  ]
}
```

## How to Update

1. **Go to AWS Console**: https://console.aws.amazon.com/iam/
2. **Navigate to**: Policies → LittleHeroLabsSpApiAccess
3. **Click**: "Edit" button
4. **Select**: "JSON" tab
5. **Replace** the Resource array with the new one above
6. **Click**: "Next" → "Save changes"

## Why This Might Fix It

- More specific resource patterns match Amazon's exact API paths
- Some AWS services require exact path matching, not just wildcards
- The specific paths ensure all messaging endpoints are covered

---

## Where to Find Cloudflare Pages Logs

### Option 1: Cloudflare Dashboard (Easiest)

1. **Go to**: https://dash.cloudflare.com
2. **Navigate to**: Pages → Your Project (little-hero-books or similar)
3. **Click**: "Logs" tab (or "Real-time Logs")
4. **Search for**: `[Amazon SP-API] Full Request/Response Details for Support`
5. **Or search for**: `Request failed` or `403`

### Option 2: Cloudflare Dashboard - Deployments

1. **Go to**: Pages → Your Project
2. **Click**: "Deployments" tab
3. **Find**: Latest deployment
4. **Click**: "View Logs" or "Functions" tab
5. **Look for**: Error logs with Amazon API calls

### Option 3: Cloudflare Workers Dashboard

If using Workers:
1. **Go to**: Workers & Pages → Your Project
2. **Click**: "Logs" tab
3. **Filter by**: Error level or search for "Amazon"

### Option 4: Use the Test Endpoint (Easier)

Instead of searching logs, trigger a test that captures the error:

```bash
curl "https://admin.littleherolabs.com/api/admin/test-amazon-messaging?orderId=111-0060602-1283417"
```

The response will include error details in the `diagnostics` field.

---

## What to Look For in Logs

When you find the log entry, look for:

1. **Request ID**: `x-amzn-requestid` header value
2. **Error Code**: Usually in `errors[0].code`
3. **Error Message**: Usually in `errors[0].message`
4. **Full Response**: The complete error response body

Example log entry structure:
```json
{
  "applicationId": "amzn1.application-oa2-client.704d66d4cc6645f58405d34f80fa5f58",
  "developerAccountId": "A2V719MRGLK48O",
  "api": "Selling Partner API",
  "operation": "/messaging/v1/orders/111-0060602-1283417",
  "timestamp": "20251214T210743Z",
  "requestId": "xxxx-xxxx-xxxx",
  "fullResponse": {
    "status": 403,
    "body": "{\"errors\":[{\"code\":\"Unauthorized\",\"message\":\"Access to requested resource is denied\"}]}"
  }
}
```

---

## After Updating Policy

1. **Wait 1-2 minutes** for policy changes to propagate
2. **Test again**:
   ```bash
   curl "https://admin.littleherolabs.com/api/admin/test-amazon-messaging?orderId=111-0060602-1283417"
   ```
3. **Check if 403 error is resolved**

---

## If Still Getting 403

If updating the policy doesn't fix it, the issue is likely:
1. **Order doesn't belong to your seller account** (most likely)
2. **Application not properly authorized** (check Seller Central)
3. **Buyer Communication role not active** (check Developer Profile)

