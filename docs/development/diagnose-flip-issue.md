# Diagnosing Flip Image Issue

## Problem
Image appears flipped in Tab 2 but reverts in W3-generated PNGs.

## Diagnostic Steps

### 1. Check 2B Manifest Entry
Verify the manifest entry has `flipped` and `flippedAt` fields:

```bash
# Get the 2B manifest URL for your order
# Example: https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/E2E-002/manifests/2b-manifest.json

# Check the entry for the flipped pose (e.g., pose 5)
# Look for:
# - entry.flipped === true
# - entry.flippedAt (ISO timestamp)
# - entry.bgRemovedKey (should point to the flipped image)
```

### 2. Check Image in R2
Verify the actual image file in R2 is flipped:
- The `bgRemovedKey` should point to the flipped image
- Check the image directly: `https://admin.littleherolabs.com/api/assets/{bgRemovedKey}`

### 3. Check W3 Node Output
In n8n, check the "Build Assembly Input From Manifest" node output:
- Look at `processedImages` array
- Find the flipped pose entry
- Verify `publicUrl` includes cache-busting query: `?v={timestamp}`
- Example: `https://admin.littleherolabs.com/api/assets/.../pose05-nobg.png?v=1734123456789`

### 4. Check Backend Proxy Caching
The backend proxy (`/api/assets/`) might be caching. Check:
- Response headers for `Cache-Control`
- If caching is too aggressive, the `?v=` parameter might not be respected

### 5. Timing Issue
If W3 runs immediately after flip:
- The manifest might not be saved yet
- Wait a few seconds after flipping before triggering W3

## Quick Fix: Force Cache Bust

If cache-busting isn't working, you can manually add a timestamp to the URL in W3's "Build Assembly Input From Manifest" node.

## Expected Flow

1. **User clicks "Flip Horizontally"** in Tab 2
   - Image is flipped via canvas
   - Uploaded to R2 via `/api/orders/{orderId}/replace-image`
   - Manifest entry updated: `flipped: true`, `flippedAt: timestamp`

2. **W3 "Build Assembly Input From Manifest" reads manifest**
   - Checks `entry.flipped` and `entry.flippedAt`
   - Adds cache-busting: `?v={flippedAt timestamp}` to URL

3. **W3 "Load Story & Character Poses" uses the URL**
   - Should use the cache-busted URL with flipped image

4. **PDFMonkey renders the image**
   - Should fetch the flipped image from the cache-busted URL

## Common Issues

1. **Manifest not updated**: Check if `flipped` and `flippedAt` are in the manifest entry
2. **Cache-busting not applied**: Check if `publicUrl` in `processedImages` has `?v=` parameter
3. **Backend proxy caching**: The proxy might be caching despite the query parameter
4. **Image not actually flipped in R2**: The upload might have failed silently

