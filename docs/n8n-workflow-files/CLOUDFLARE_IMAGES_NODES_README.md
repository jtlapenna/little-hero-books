# Cloudflare Images Nodes - Import Guide

## File
`cloudflare-images-nodes.json`

## What's Included

Two nodes ready to import into n8n:

1. **Upload Preview Image to Cloudflare Images** (HTTP Request node)
   - Uploads preview images to Cloudflare Images API
   - Uses environment variables for credentials
   - Has "Continue On Fail" enabled (workflow continues if upload fails)

2. **Store Cloudflare Images ID** (Code node)
   - Extracts Cloudflare Images ID from upload response
   - Combines with page data from R2 upload
   - Outputs: `pageNumber`, `r2Key`, `cloudflareImageId`, `cloudflareImageUrl`

## How to Import

1. Open your Workflow 3 in n8n
2. Click the **"..." menu** (top right) → **Import from File**
3. Select `cloudflare-images-nodes.json`
4. The nodes will be added to your workflow

## How to Connect

1. Find the **"Upload Page Preview Image to R2"** node in your workflow
2. Connect it to **"Upload Preview Image to Cloudflare Images"**
3. Connect **"Upload Preview Image to Cloudflare Images"** to **"Store Cloudflare Images ID"**
4. Connect **"Store Cloudflare Images ID"** to your **"Build 3 Manifest"** node

## Configuration Needed

### 1. HTTP Request Node - Binary Data Source

The HTTP Request node expects binary data from the previous node. Make sure:
- The node before it (R2 upload) passes binary data through
- Binary data key is `data` (or update the expression to match your binary key)

If your binary data has a different key, update this line in the HTTP Request node:
```
"value": "={{ $binary.data }}"
```
Change `data` to your actual binary key (e.g., `$binary.image`, `$binary.file`, etc.)

### 2. Code Node - R2 Node Name

The Code node looks for the R2 upload node by name. If your node has a different name, update this line:
```javascript
const r2NodeName = 'Upload Page Preview Image to R2';
```

### 3. Environment Variables

Make sure these are set in n8n:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_IMAGES_API_TOKEN`
- `CLOUDFLARE_IMAGES_ACCOUNT_HASH`

## Update Manifest Node

After importing, you'll need to manually update your **"Build 3 Manifest"** node to include:

```javascript
{
  pageNumber: page.pageNumber,
  r2Key: page.r2Key,
  cloudflareImageId: page.cloudflareImageId || null,
  previewImageUrl: page.cloudflareImageUrl || null
}
```

## Testing

1. Run a test execution
2. Check the HTTP Request node output - should see Cloudflare Images API response with `result.id`
3. Check the Code node output - should see `cloudflareImageId` and `cloudflareImageUrl` fields
4. Verify the manifest includes Cloudflare Images data

## Troubleshooting

**Issue**: Binary data not found
- Check that the previous node (R2 upload) outputs binary data
- Verify the binary key name matches (default is `data`)

**Issue**: Cloudflare API returns 401
- Check `CLOUDFLARE_IMAGES_API_TOKEN` is correct
- Verify token has `Edit` permission for Cloudflare Images

**Issue**: Code node can't find R2 upload node
- Update `r2NodeName` in the Code node to match your actual node name
- Or manually pass page data through the workflow

**Issue**: Manifest doesn't include Cloudflare data
- Make sure you updated the "Build 3 Manifest" node to include `cloudflareImageId` and `previewImageUrl`
- Check that the Code node output is connected to the manifest node

