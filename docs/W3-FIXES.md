# Workflow 3 Fixes

## Issue 1: W3 Not Using Flipped Images

**Node:** "Build Assembly Input From Manifest"

**Problem:** The node doesn't check for `flipped`/`flippedAt` to add cache-busting, so W3 uses cached (non-flipped) images.

**Fix:** Update the `toProxy` function to add cache-busting when images are flipped.

### Updated Code:

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
    publicUrl: toProxy(e.bgRemovedKey, e.flipped, e.flippedAt), // Pass flipped/flippedAt to toProxy
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

## Issue 2: Tab 3 R2 Fallback Not Loading Images

**File:** `back-end/src/components/stages/post-pdf-stage.tsx`

**Problem:** When building `previewImages` from `pngGeneration.pages`, the code sets `r2Key` but `imageUrl` is `null`. The fallback logic should construct the URL from `r2Key`, but it's not working.

**Fix:** Ensure that when building from `pngGeneration.pages`, we also set `imageUrl` to the constructed R2 proxy URL so the fallback works immediately.

### Updated Code (around line 340):

```typescript
return {
  pageNumber,
  r2Key: typeof r2Key === 'string' ? r2Key : null,
  imageUrl: typeof r2Key === 'string' ? `/api/assets/${r2Key}` : null, // Construct URL immediately
  filename: null
};
```

This ensures that when the code later checks for `img.r2Key` and constructs the URL, it will already have `imageUrl` set, making the fallback work correctly.

