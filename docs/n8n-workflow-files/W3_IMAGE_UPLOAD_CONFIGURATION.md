# Workflow 3 - Image Upload Configuration Guide

**Date:** 2025-01-09  
**Purpose:** Configure S3 (R2) and Cloudflare Images upload nodes in Workflow 3

---

## ⚠️ Important Clarification

**Two Different Services Require Two Different Node Types:**

1. **Cloudflare R2** → Use **S3 Upload Node** (S3-compatible API)
2. **Cloudflare Images** → Use **HTTP Request Node** (REST API with multipart form data)

The node "Upload Preview Image to Cloudflare Images1" in your screenshot is **incorrectly configured** - it's using an S3 credential but should be an HTTP Request node.

---

## Workflow Wiring Assessment

**✅ Your wiring looks correct:**

```
Cover Branch:
  Download Cover Image (3A)
    ↓
  Carry Cover Keys Forward
    ↓ (splits)
    ├─→ Upload Cover Preview Image to R2 (3A) ──┐
    └─────────────────────────────────────────────┼─→ Merge ─→ Build 3A Manifest
                                                  │
Preview Branch:                                   │
  Upload Preview Image to Cloudflare Images1 ──→ Store Cloudflare Images ID ──┘
```

**The Merge node correctly combines:**
- Input 1: Cover keys from "Carry Cover Keys Forward"
- Input 2: R2 upload result from "Upload Cover Preview Image to R2 (3A)"
- Input 3: Cloudflare Images data from "Store Cloudflare Images ID"

---

## 1. Configure S3 Upload Node for R2

**Node Name:** `Upload Cover Preview Image to R2 (3A)` (or similar for page previews)

### Step 1: Create/Select S3 Credential

1. Go to **Credentials** in n8n
2. Create new **AWS S3** credential (or select existing)
3. Configure:
   - **Access Key ID:** `{{ $env.R2_ACCESS_KEY_ID }}` or your actual R2 access key
   - **Secret Access Key:** `{{ $env.R2_SECRET_ACCESS_KEY }}` or your actual R2 secret key
   - **Region:** `auto` (required for R2)
   - **Custom Endpoint:** `https://{{ $env.CLOUDFLARE_ACCOUNT_ID }}.r2.cloudflarestorage.com`
     - Replace `{{ $env.CLOUDFLARE_ACCOUNT_ID }}` with your actual Cloudflare Account ID
     - Example: `https://abc123def456.r2.cloudflarestorage.com`
   - **Force Path Style:** ✅ **Enable** (required for R2)

### Step 2: Configure S3 Node Parameters

**Node Type:** `AWS S3` (or `S3`)

**Parameters:**
- **Resource:** `File`
- **Operation:** `Upload`
- **Bucket Name:** `little-hero-orders`
- **File Name (Key):** 
  ```
  book-mvp-simple-adventure/orders/{{ $json.orderId || $json.amazonOrderId }}/preview-images/{{ $json.pageNumber ? 'p' + String($json.pageNumber).padStart(2, '0') + '.png' : 'cover_preview.png' }}
  ```
  
  **For cover images specifically:**
  ```
  book-mvp-simple-adventure/orders/{{ $json.orderId || $json.amazonOrderId }}/preview-images/cover_preview.png
  ```
  
  **For page previews:**
  ```
  book-mvp-simple-adventure/orders/{{ $json.orderId || $json.amazonOrderId }}/preview-images/p{{ String($json.pageNumber || 0).padStart(2, '0') }}.png
  ```

- **Binary Data:** ✅ **Enable**
- **Input Binary Field:** `data` (or whatever field contains your binary image data)
- **Additional Fields:**
  - **ACL:** `private` (recommended - use signed URLs for access)
  - **Content Type:** `image/png` or `image/jpeg` (match your image format)

### Step 3: Enable Error Handling

- **Continue On Fail:** ✅ **Enable** (so workflow continues if upload fails)

### Example S3 Node Configuration:

```json
{
  "parameters": {
    "operation": "upload",
    "bucketName": "little-hero-orders",
    "fileName": "book-mvp-simple-adventure/orders/{{ $json.orderId || $json.amazonOrderId }}/preview-images/cover_preview.png",
    "binaryData": true,
    "binaryPropertyName": "data",
    "additionalFields": {
      "acl": "private",
      "contentType": "image/png"
    },
    "options": {
      "continueOnFail": true
    }
  },
  "credentials": {
    "s3": {
      "id": "your-s3-credential-id",
      "name": "R2 S3 Account"
    }
  }
}
```

---

## 2. Fix Cloudflare Images Upload Node

**⚠️ CRITICAL:** The node "Upload Preview Image to Cloudflare Images1" should **NOT** use an S3 credential. It needs to be an **HTTP Request** node.

### Step 1: Change Node Type

1. Delete or reconfigure the current node
2. Add new **HTTP Request** node
3. Name it: `Upload Preview Image to Cloudflare Images`

### Step 2: Configure HTTP Request Node

**Node Type:** `HTTP Request`

**Parameters:**
- **Method:** `POST`
- **URL:** 
  ```
  https://api.cloudflare.com/client/v4/accounts/{{ $env.CLOUDFLARE_ACCOUNT_ID }}/images/v1
  ```
- **Authentication:** `Generic Credential Type` or `Header Auth`
- **Send Headers:** ✅ **Enable**
- **Header Parameters:**
  - **Name:** `Authorization`
  - **Value:** `Bearer {{ $env.CLOUDFLARE_IMAGES_API_TOKEN }}`
- **Send Body:** ✅ **Enable**
- **Body Content Type:** `Multipart-Form Data`
- **Specify Body:** `Keypair`
- **Body Parameters:**
  - **Parameter 1:**
    - **Name:** `file`
    - **Value:** `={{ $binary.data }}`
    - **Parameter Type:** `File` ⚠️ **CRITICAL: Must be "File" type**
  - **Parameter 2:**
    - **Name:** `metadata`
    - **Value:** `={{ JSON.stringify({ orderId: $json.orderId || $json.amazonOrderId || 'UNKNOWN', pageNumber: $json.pageNumber || $json.pageNum || 0 }) }}`
    - **Parameter Type:** `String`
- **Options:**
  - **Continue On Fail:** ✅ **Enable**
  - **Response:**
    - **Response Format:** `JSON`
    - **Full Response:** ✅ **Enable** (to get status code)

### Step 3: Verify Output

The Cloudflare Images API returns:
```json
{
  "result": {
    "id": "abc123def456...",
    "filename": "cover_preview.png",
    "uploaded": "2025-01-09T17:00:00.000Z",
    "requireSignedURLs": false,
    "variants": [
      "https://imagedelivery.net/{accountHash}/{id}/public",
      "https://imagedelivery.net/{accountHash}/{id}/preview"
    ]
  },
  "success": true,
  "errors": [],
  "messages": []
}
```

---

## 3. Complete Node Configuration Examples

### Node 1: Upload Cover Preview Image to R2 (S3 Node)

```json
{
  "name": "Upload Cover Preview Image to R2 (3A)",
  "type": "n8n-nodes-base.s3",
  "typeVersion": 1,
  "parameters": {
    "operation": "upload",
    "bucketName": "little-hero-orders",
    "fileName": "book-mvp-simple-adventure/orders/{{ $json.orderId || $json.amazonOrderId }}/preview-images/cover_preview.png",
    "binaryData": true,
    "binaryPropertyName": "data",
    "additionalFields": {
      "acl": "private"
    },
    "options": {
      "continueOnFail": true
    }
  },
  "credentials": {
    "s3": {
      "id": "your-r2-s3-credential-id",
      "name": "R2 S3 Account"
    }
  }
}
```

### Node 2: Upload Preview Image to Cloudflare Images (HTTP Request Node)

```json
{
  "name": "Upload Preview Image to Cloudflare Images",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "parameters": {
    "method": "POST",
    "url": "https://api.cloudflare.com/client/v4/accounts/{{ $env.CLOUDFLARE_ACCOUNT_ID }}/images/v1",
    "authentication": "genericCredentialType",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Authorization",
          "value": "Bearer {{ $env.CLOUDFLARE_IMAGES_API_TOKEN }}"
        }
      ]
    },
    "sendBody": true,
    "bodyContentType": "multipart-form-data",
    "specifyBody": "keypair",
    "bodyParameters": {
      "parameters": [
        {
          "name": "file",
          "value": "={{ $binary.data }}",
          "parameterType": "file"
        },
        {
          "name": "metadata",
          "value": "={{ JSON.stringify({ orderId: $json.orderId || $json.amazonOrderId || 'UNKNOWN', pageNumber: $json.pageNumber || $json.pageNum || 0 }) }}"
        }
      ]
    },
    "options": {
      "continueOnFail": true,
      "response": {
        "response": {
          "responseFormat": "json",
          "fullResponse": true
        }
      }
    }
  }
}
```

### Node 3: Store Cloudflare Images ID (Code Node)

This node extracts the Cloudflare Images ID from the HTTP response and combines it with the R2 data. Use the code from `cloudflare-images-nodes.json` (already provided).

---

## 4. Environment Variables Required

Make sure these are set in n8n:

```bash
# R2 Configuration (for S3 node)
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
CLOUDFLARE_ACCOUNT_ID=your_account_id

# Cloudflare Images Configuration (for HTTP Request node)
CLOUDFLARE_IMAGES_API_TOKEN=your_cloudflare_images_api_token
CLOUDFLARE_IMAGES_ACCOUNT_HASH=your_account_hash  # For constructing delivery URLs
```

---

## 5. Common Issues and Fixes

### Issue 1: "S3 credential selected for Cloudflare Images"
**Fix:** Change the Cloudflare Images node to HTTP Request type, not S3.

### Issue 2: "File parameter not uploading"
**Fix:** Ensure `parameterType: "file"` is set for the `file` parameter in the HTTP Request body.

### Issue 3: "R2 upload fails with endpoint error"
**Fix:** 
- Verify Custom Endpoint is: `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
- Ensure "Force Path Style" is enabled
- Check region is set to `auto`

### Issue 4: "Binary data not found"
**Fix:** 
- Verify previous node outputs binary data in `data` field
- Check "Input Binary Field" matches the actual binary field name
- Use `={{ $binary.data }}` expression

---

## 6. Testing the Configuration

1. **Test S3 (R2) Upload:**
   - Run workflow with test data
   - Check R2 bucket: `little-hero-orders/book-mvp-simple-adventure/orders/{orderId}/preview-images/`
   - Verify file appears in bucket

2. **Test Cloudflare Images Upload:**
   - Check HTTP Request node output
   - Verify `result.id` exists in response
   - Check Cloudflare Images dashboard for uploaded image

3. **Test Merge Node:**
   - Verify all 3 inputs are connected
   - Check merged output contains:
     - R2 key from S3 upload
     - Cloudflare Images ID from HTTP Request
     - Original order/page data

---

## Summary

✅ **Wiring is correct** - Merge node properly combines all three data sources

✅ **S3 Node for R2:**
- Use AWS S3 node type
- Configure with R2 endpoint and credentials
- Set bucket to `little-hero-orders`
- Use proper key path structure

✅ **Cloudflare Images:**
- Use HTTP Request node (NOT S3)
- POST to Cloudflare Images API
- Use Bearer token authentication
- Set `file` parameter type to "File"

✅ **Error Handling:**
- Enable "Continue On Fail" on both upload nodes
- This ensures workflow continues even if one upload fails

---

**Next Steps:**
1. Fix the Cloudflare Images node (change from S3 to HTTP Request)
2. Configure S3 node with R2 credentials and endpoint
3. Test both uploads with sample data
4. Verify Merge node receives all three inputs correctly

