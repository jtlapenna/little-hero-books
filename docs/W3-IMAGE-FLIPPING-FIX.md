# Workflow 3 Image Flipping Fix

## Problem
When images are flipped in Tab 2 (Post-Bria stage), the flipped image is correctly saved to R2 storage and the `flipped`/`flippedAt` flags are set in the 2B manifest. However, Workflow 3 does not use the flipped images because:

1. **"Build Assembly Input From Manifest" node** doesn't read `flipped`/`flippedAt` from manifest entries
2. **"Build Assembly Input From Manifest" node** doesn't add cache-busting to URLs for flipped images
3. **"Generate Complete HTML" node** doesn't check if images were already flipped in R2, causing double-flipping or incorrect orientation

## Fix 1: "Build Assembly Input From Manifest" Node

**Location:** First node after "Download 2B Manifest"

**Current Code Issue:**
- Doesn't read `e.flipped` or `e.flippedAt` from manifest entries
- `toProxy()` function doesn't add cache-busting
- `processedImages` doesn't include `flipped` flag

**Updated Code:**

```javascript
/**
 * Build Assembly Input From Manifest
 * Converts 2B manifest into the payload expected downstream.
 */
const input = $input.first().json || {};
const manifest = input || {}; // HTTP node passes manifest JSON as item

// Validate manifest schema
if (!manifest.schema || !manifest.schema.includes('lhb.run-manifest')) {
  throw new Error(`Invalid or missing manifest schema. Expected 'lhb.run-manifest@v2.0', got: ${manifest.schema || 'undefined'}`);
}

// Try to get preserved context from Extract node
let ctx = {};
try { ctx = $items('Extract Manifest URL (3)', 0, $runIndex)?.[0]?.json || {}; } catch {}

const order = manifest.order || {};
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const amazonOrderId = order.amazonOrderId || ctx.orderId || null;
const characterHash = manifest.characterHash || order.characterHash || null;
const backendUrl = ctx.backendUrl || 'https://admin.littleherolabs.com';

// Validate required fields
if (!amazonOrderId) {
  throw new Error('Manifest missing required order.amazonOrderId');
}
if (!characterHash) {
  throw new Error('Manifest missing required characterHash');
}
if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
  throw new Error('Manifest has no entries (poses)');
}

// Updated toProxy function with cache-busting for flipped images
const toProxy = (key, flipped = false, flippedAt = null) => {
  let url = `${backendUrl}/api/assets/${key}`;
  // Add cache-busting query parameter if image was flipped to ensure W3 gets the updated version
  if (flipped && flippedAt) {
    const cacheBuster = new Date(flippedAt).getTime();
    url = `${url}?v=${cacheBuster}`;
  }
  return url;
};

const processedImages = entries
  .filter(e => Number.isFinite(Number(e.poseNumber)) && e.bgRemovedKey)
  .sort((a,b) => a.poseNumber - b.poseNumber)
  .map(e => ({
    poseNumber: e.poseNumber,
    fileName: (e.bgRemovedKey.split('/').pop()) || `pose${String(e.poseNumber).padStart(2,'0')}_nobg.png`,
    r2Path: e.bgRemovedKey,
    publicUrl: toProxy(e.bgRemovedKey, e.flipped || false, e.flippedAt || null), // Pass flipped/flippedAt to toProxy
    flipped: e.flipped || false, // Include flipped flag for downstream nodes
    flippedAt: e.flippedAt || null, // Include flippedAt timestamp
    briaProcessed: true,
    briaStatus: 'COMPLETED',
    processingError: false,
  }));

return [{ json: {
  amazonOrderId,
  characterHash,
  characterSpecs: order.characterSpecs || {},
  bookSpecs: order.bookSpecs || {},
  orderDetails: order.orderDetails || {},
  publicR2Url: order.publicR2Url || null,
  backendUrl,
  processedImages
} }];
```

## Fix 2: "Generate Complete HTML" Node

**Location:** Node that generates HTML for interior pages

**Current Code Issue:**
- `charStyle()` function applies CSS `scaleX(flip)` based on CHAR table without checking if image was already flipped in R2
- This causes double-flipping when image is already flipped in R2

**Updated Code Section:**

Add this code right after the `PAGE_TO_POSE_MAP` definition and before the `findPose` function:

```javascript
// Map poseNumber to its flipped status from processedImages
// This allows us to check if an image was already flipped in R2 (Tab 2)
const processedImagesFlippedMap = new Map();
if (Array.isArray(order.processedImages)) {
  order.processedImages.forEach(pi => {
    if (Number.isFinite(Number(pi.poseNumber)) && pi.flipped) {
      processedImagesFlippedMap.set(Number(pi.poseNumber), true);
    }
  });
}
```

Then update the `charStyle` function to check for flipped images:

```javascript
// ---- inline style builders ----
function charStyle(n){
  // Map pageNumber to poseNumber using PAGE_TO_POSE_MAP
  const poseNumber = PAGE_TO_POSE_MAP[n];
  
  // Check if this image was already flipped in R2
  const wasFlipped = poseNumber ? (processedImagesFlippedMap.get(poseNumber) || false) : false;
  
  if (n === 3) {
    // If image was flipped in R2, invert the CSS flip to avoid double-flipping
    const finalFlip = wasFlipped ? OV3.flip * -1 : OV3.flip;
    return [
      `left:${toPx(OV3.left)}`,
      `top:${toPx(OV3.top)}`,
      `transform:translate(-50%,-100%) scaleX(${finalFlip})`,
      `width:${toPx(OV3.w)}`,
      `z-index:11`
    ].join('; ') + ';';
  }
  if (n === 4) {
    const finalFlip = wasFlipped ? OV4.flip * -1 : OV4.flip;
    return [
      `left:${toPx(OV4.left)}`,
      `top:${toPx(OV4.top)}`,
      `transform:translate(-50%,-100%) scaleX(${finalFlip}) rotate(-20deg)`,
      `width:${toPx(OV4.w)}`,
      `z-index:11`
    ].join('; ') + ';';
  }
  if (n === 14) {
    const finalFlip = wasFlipped ? OV14C.flip * -1 : OV14C.flip;
    return [
      `left:${toPx(OV14C.left)}`,
      `top:${toPx(OV14C.top)}`,
      `transform:translate(-50%,-100%) scaleX(${finalFlip})`,
      `width:${toPx(OV14C.w)}`,
      `z-index:11`
    ].join('; ') + ';';
  }
  const c = CHAR[n];
  if (!c) return '';
  // If image was flipped in R2, invert the CSS flip to avoid double-flipping
  const finalFlip = wasFlipped ? (c.flip ?? 1) * -1 : (c.flip ?? 1);
  return [
    `left:${toPx(c.left)}`,
    `top:${toPx(c.top)}`,
    `transform:translate(-50%,-100%) scaleX(${finalFlip})`,
    `width:${toPx(c.w)}`,
    `z-index:11`
  ].join('; ') + ';';
}
```

## Testing Checklist

1. **Test Flip Operation:**
   - Flip an image in Tab 2 (Post-Bria stage)
   - Verify 2B manifest has `flipped: true` and `flippedAt: timestamp` for that pose
   - Verify R2 file is actually flipped (download and inspect)

2. **Test W3 Execution:**
   - Run W3 after flipping
   - Check "Build Assembly Input From Manifest" output - verify `publicUrl` has `?v=timestamp` for flipped images
   - Check "Generate Complete HTML" output - verify it uses the `publicUrl` with cache-busting
   - Verify final PNG/PDF shows flipped image (not original, not double-flipped)

3. **Test Edge Cases:**
   - Flip same image twice (should update timestamp)
   - Flip multiple images
   - Verify CSS-flipped images (that weren't R2-flipped) still work correctly

## Files Modified

1. **n8n Workflow 3:**
   - "Build Assembly Input From Manifest" node
   - "Generate Complete HTML" node

2. **Backend (Already Working):**
   - `back-end/src/app/api/orders/[orderId]/replace-image/route.ts` - Sets flipped flags ✓
   - `back-end/src/app/api/assets/[...path]/route.ts` - Handles cache-busting ✓

