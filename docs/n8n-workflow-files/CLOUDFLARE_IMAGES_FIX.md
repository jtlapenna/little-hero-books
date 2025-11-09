# Cloudflare Images Upload Fix

## Problem
The HTTP Request node is only sending metadata, not the binary file. The response shows `result.images: []` because no file was uploaded.

## Solution

### 1. Update HTTP Request Node Configuration

In the "Upload Preview Image to Cloudflare Images" HTTP Request node:

**Body Parameters → file parameter:**
- **Name**: `file`
- **Value**: `={{ $binary.data }}` (NOT just `data`)
- **Parameter Type**: `file`

**Important**: The value must be an expression (`={{ $binary.data }}`) to access the binary data from the input item.

### 2. Verify Input Data

The HTTP Request node must receive binary data from the upstream node. Check:

1. **Upstream Node Output**: The node before the HTTP Request should output binary data
2. **Binary Property**: The binary data should be in `$binary.data`
3. **Data Type**: Should be PNG or JPEG image data

### 3. Expected Request Structure

When configured correctly, the HTTP Request should send:
- **file**: Binary image data (PNG/JPEG)
- **metadata**: JSON string with orderId and pageNumber

### 4. Expected Response

After fixing, you should see:
```json
{
  "result": {
    "id": "abc123def456...",
    "filename": "p01.png",
    "uploaded": "2025-01-09T12:00:00.000Z",
    ...
  },
  "success": true
}
```

NOT:
```json
{
  "result": {
    "images": []
  },
  "success": true
}
```

### 5. Troubleshooting

If `={{ $binary.data }}` doesn't work, try:
- `={{ $binary }}`
- `data` (without expression, but this usually doesn't work)
- Check the upstream node's binary output property name

### 6. Verify Binary Data Flow

1. Check the node before HTTP Request
2. Ensure it outputs binary data (not just JSON)
3. The binary should be accessible as `$binary.data` in the HTTP Request node

