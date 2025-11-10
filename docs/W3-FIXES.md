# Workflow 3 Fixes

## Issue 1: Cloudflare Images Data Not Preserved in Manifest

**Nodes:** "Collect Page Preview Images" and "Build 3A Manifest"

**Problem:** The "Collect Page Preview Images" node strips Cloudflare Images data (`cloudflareImageId`, `cloudflareImageUrl`) from the page data, so it never makes it to the manifest. The "Build 3A Manifest" node also needs to properly read and include this data.

**Fix:** Update both nodes to preserve and include Cloudflare Images data.

### Updated "Collect Page Preview Images" Code:

```javascript
/**
 * Collect All Page Preview Images (Run once for all items)
 * - Reads original items from "Generate Page Preview Images"
 * - Preserves Cloudflare Images data from "Store Cloudflare Images ID" node
 * - Builds progress counters
 */
const SOURCE_NODE = 'Generate Page Preview Images'; // exact node name
const CLOUDFLARE_NODE = 'Store Cloudflare Images ID'; // Cloudflare Images data source

const previews = $items(SOURCE_NODE);
if (!previews || previews.length === 0) {
  throw new Error(`No items found from "${SOURCE_NODE}". Ensure that node produced per-page items.`);
}

// Get Cloudflare Images data (if available)
let cloudflareDataMap = new Map();
try {
  const cloudflareItems = $items(CLOUDFLARE_NODE, 0, $runIndex) || [];
  cloudflareItems.forEach(item => {
    const data = item.json || item;
    const pageNum = Number(data.pageNumber);
    if (Number.isFinite(pageNum)) {
      cloudflareDataMap.set(pageNum, {
        cloudflareImageId: data.cloudflareImageId || null,
        cloudflareImageUrl: data.cloudflareImageUrl || null
      });
    }
  });
} catch (e) {
  console.warn(`Could not fetch Cloudflare Images data from "${CLOUDFLARE_NODE}":`, e.message);
}

const base = previews[0]?.json || {};
const amazonOrderId = base.amazonOrderId || 'ORDER';
const backendUrl = base.backendUrl || 'https://admin.littleherolabs.com';
const publicR2Url = base.publicR2Url || null;

// Helper to form a public URL for an r2Key
function toPublicUrl(r2Key) {
  if (!r2Key) return null;
  if (backendUrl) return `${backendUrl}/api/assets/${r2Key}`;
  if (publicR2Url) return `${publicR2Url.replace(/\/$/, '')}/${r2Key}`;
  return null;
}

// Build page images list from originals, preserving Cloudflare Images data
const pageImages = previews
  .map(it => {
    const j = it.json || {};
    const pageNumber = Number(j.pageNumber);
    const r2Key = j.pageImageR2Key;
    const filename = j.pageImageFilename || (r2Key ? r2Key.split('/').pop() : null);
    
    if (!Number.isFinite(pageNumber)) return null;
    
    // Get Cloudflare Images data for this page
    const cfData = cloudflareDataMap.get(pageNumber);
    
    return {
      pageNumber,
      r2Key,
      filename,
      imageUrl: toPublicUrl(r2Key),
      // Preserve Cloudflare Images data
      cloudflareImageId: cfData?.cloudflareImageId || null,
      cloudflareImageUrl: cfData?.cloudflareImageUrl || null
    };
  })
  .filter(Boolean)
  .sort((a,b) => a.pageNumber - b.pageNumber);

// Progress counters
const pagesGenerated = pageImages.length;

// Derive total pages required from whichever source we have
const totalFromStory = Array.isArray(base.storyTexts) ? base.storyTexts.length : 0;
const totalFromBackgrounds = Array.isArray(base.backgroundImages) ? base.backgroundImages.length : 0;
const totalFromBookSpecs = base.bookSpecs && Number.isFinite(base.bookSpecs.totalPages)
  ? (base.bookSpecs.totalPages - (base.bookSpecs.frontMatterPages || 2))  // if you use 16 incl. covers, adjust as needed
  : 0;

// Prefer explicit per-story/page assets; fall back to a reasonable number
const totalPagesRequired = Math.max(totalFromStory, totalFromBackgrounds, totalFromBookSpecs, 0) || pageImages.length;
const assemblyProgress = totalPagesRequired > 0
  ? Math.round((pagesGenerated / totalPagesRequired) * 100) / 100
  : 0;

return [{
  json: {
    ...base,
    status: pagesGenerated >= totalPagesRequired ? 'book_assembly_previews_ready' : 'book_assembly_in_progress',
    assemblyStartedAt: base.assemblyStartedAt || new Date().toISOString(),
    pagesGenerated,
    totalPagesRequired,
    assemblyProgress,
    pagePreviewImages: pageImages,
    totalPages: pageImages.length,
    imagesCollectedAt: new Date().toISOString(),
    success: pageImages.length > 0,
  }
}];
```

### Updated "Build 3A Manifest" Code:

```javascript
/** Build 3A Manifest: interiors + cover + assetsUsed + Cloudflare Images (Phase 4) */

const base = $input.first().json || {};

// Robust pulls from Phase-1 nodes
let inputs    = {};
let renderCtx = {};
try {
  inputs    = $items('Normalize Inputs (3A Phase 1)', 0, $runIndex)?.[0]?.json?.inputs || {};
  renderCtx = $items('Resolve Asset Paths (3A Phase 1)', 0, $runIndex)?.[0]?.json?.renderContext || {};
} catch {}

const amazonOrderId = base.amazonOrderId || base.orderId || null;
if (!amazonOrderId) throw new Error('amazonOrderId/orderId is required');

// Collect page preview images from the collector node output (already assembled)
const collected = $items('Collect Page Preview Images', 0, $runIndex)?.[0]?.json || base;
const pagePreviewImages = Array.isArray(collected.pagePreviewImages) ? collected.pagePreviewImages : [];

// Get Cloudflare Images data from "Store Cloudflare Images ID" node (Input 3 to Merge)
let cloudflareImagesData = [];
try {
  const cloudflareNode = $items('Store Cloudflare Images ID', 0, $runIndex);
  if (Array.isArray(cloudflareNode)) {
    cloudflareImagesData = cloudflareNode.map(item => item.json || item);
  } else if (cloudflareNode && cloudflareNode.json) {
    cloudflareImagesData = [cloudflareNode.json];
  }
} catch (e) {
  console.warn('[Build 3A Manifest] Could not fetch Cloudflare Images data:', e.message);
}

// Create a map of pageNumber -> Cloudflare Images data for quick lookup
const cloudflareMap = new Map();
cloudflareImagesData.forEach(cf => {
  const pageNum = Number(cf.pageNumber || cf.pageNum || 0);
  if (Number.isFinite(pageNum)) {
    cloudflareMap.set(pageNum, {
      cloudflareImageId: cf.cloudflareImageId || null,
      cloudflareImageUrl: cf.cloudflareImageUrl || null
    });
  }
});

// Also check pagePreviewImages for Cloudflare Images data (from Collect node)
pagePreviewImages.forEach(p => {
  const pageNum = Number(p.pageNumber);
  if (Number.isFinite(pageNum) && (p.cloudflareImageId || p.cloudflareImageUrl)) {
    // Update map if not already set or if pagePreviewImages has more complete data
    if (!cloudflareMap.has(pageNum) || (p.cloudflareImageId && !cloudflareMap.get(pageNum)?.cloudflareImageId)) {
      cloudflareMap.set(pageNum, {
        cloudflareImageId: p.cloudflareImageId || null,
        cloudflareImageUrl: p.cloudflareImageUrl || null
      });
    }
  }
});

// Optionally derive public URLs array for W4 (prioritize Cloudflare Images URLs)
const pageImageUrls = pagePreviewImages.map(p => {
  const pageNum = Number(p.pageNumber || p.pageIndex || 0);
  const cfData = cloudflareMap.get(pageNum);
  
  // Priority 1: Cloudflare Images URL (fastest, WebP, CDN)
  if (cfData?.cloudflareImageUrl) {
    return cfData.cloudflareImageUrl;
  }
  
  // Priority 2: R2 proxy URL
  if (p.r2Key) {
    return `${(base.backendUrl || 'https://admin.littleherolabs.com')}/api/assets/${p.r2Key}`;
  }
  
  // Priority 3: Direct imageUrl
  return p.imageUrl || null;
}).filter(Boolean);

// --- Cover keys ---
// PNG (from the current cover-preview flow)
let coverImageKey = null;
let coverCloudflareImageId = null;
let coverCloudflareImageUrl = null;

try {
  const coverNode = $items('Generate Cover HTML (3A)', 0, $runIndex)?.[0]?.json || {};
  coverImageKey = coverNode.coverImageR2Key || null;
  
  // Check if cover has Cloudflare Images data (cover is typically page 0 or special handling)
  const coverCfData = cloudflareMap.get(0) || cloudflareMap.get(-1);
  if (coverCfData) {
    coverCloudflareImageId = coverCfData.cloudflareImageId;
    coverCloudflareImageUrl = coverCfData.cloudflareImageUrl;
  }
} catch {}

// PDF (preferred for W4)
let coverPdfKey =
  base.coverPdfR2Key ||
  ($items('Set Cover PDF Filenames/Keys', 0, $runIndex)?.[0]?.json?.coverPdfR2Key) ||
  ($items('Upload Cover PDF to R2', 0, $runIndex)?.[0]?.json?.coverPdfR2Key) ||
  null;

// Build pages map - STORE AS STRINGS for QA Gate compatibility
// QA Gate expects pages.p01, pages.p02, etc. to be strings (R2 keys)
// We'll store Cloudflare Images data separately in pngGeneration.pagesWithCloudflare
const pages = {};
const pagesWithCloudflare = {}; // Separate object for Cloudflare Images data

(pagePreviewImages || []).forEach(p => {
  const n = Number(p.pageNumber || p.pageIndex);
  if (!Number.isFinite(n)) return;

  // Check multiple possible key field names (including pageImageR2Key from Carry Keys node)
  const key = p.r2Key || p.pageImageR2Key || p.imageR2Key || p.key || p.path || null;
  if (!key) return; // Skip if no key found

  const cfData = cloudflareMap.get(n);
  
  // FIX: Handle page 0 (dedication) - it should be p00_dedication
  if (n === 0) {
    // Store as string for QA Gate compatibility
    pages.p00_dedication = key;
    // Store Cloudflare Images data separately
    if (cfData?.cloudflareImageId || cfData?.cloudflareImageUrl) {
      pagesWithCloudflare.p00_dedication = {
        cloudflareImageId: cfData.cloudflareImageId || null,
        cloudflareImageUrl: cfData.cloudflareImageUrl || null
      };
    }
  } else if (n >= 1 && n <= 14) {
    const id = n < 10 ? `p0${n}` : `p${n}`;
    // Store as string for QA Gate compatibility
    pages[id] = key;
    // Store Cloudflare Images data separately
    if (cfData?.cloudflareImageId || cfData?.cloudflareImageUrl) {
      pagesWithCloudflare[id] = {
        cloudflareImageId: cfData.cloudflareImageId || null,
        cloudflareImageUrl: cfData.cloudflareImageUrl || null
      };
    }
  }
});

// --- Assets used ---
const overlaysUsed = [];
try {
  const assetsSrc = $items('Load Canonical Assets', 0, $runIndex)?.[0]?.json || {};
  const ov = assetsSrc.overlayImages;
  if (Array.isArray(ov)) {
    ov.forEach(o => { if (o?.r2Key) overlaysUsed.push(o.r2Key); });
  } else if (ov && typeof ov === 'object') {
    Object.values(ov).forEach(o => { if (o?.r2Key) overlaysUsed.push(o.r2Key); });
  }
} catch {}

const assetsUsed = {
  font:        renderCtx?.font || 'book-mvp-simple-adventure/fonts/custom-font.ttf',
  coversBg:    renderCtx?.coversBg || 'book-mvp-simple-adventure/backgrounds/page00-covers.png',
  dedicationBg:renderCtx?.dedicationBg || 'book-mvp-simple-adventure/backgrounds/page00-dedication.png',
  pose00:      renderCtx?.pose00 || null,
  overlays:    overlaysUsed
};

const nowIso = new Date().toISOString();

const manifest = {
  schema: 'lhb.run-manifest@v2.0',
  runStamp: nowIso,
  characterHash: base.characterHash || $items('Get Order Ready for Assembly', 0, $runIndex)?.[0]?.json?.characterHash || null,
  amazonOrderId,
  
  pngGeneration: {
    sizeInterior: { w: 2625, h: 2625 },
    sizeCover: { w: 5203, h: 2625 },
    pages, // Strings for QA Gate compatibility
    pagesWithCloudflare, // Cloudflare Images data (optional, for frontend use)
    coverSpreadImage: coverImageKey || null,
    // Cloudflare Images data for cover
    coverCloudflareImageId: coverCloudflareImageId || null,
    coverCloudflareImageUrl: coverCloudflareImageUrl || null
  },
  
  pdfGeneration: {
    coverPdf: coverPdfKey || null
  },
  
  assetsUsed,
  pages, // duplicated for convenience (strings for backward compatibility)
  
  summary: {
    percentComplete: 100,
    readyForBook: true,
    needsHumanReview: true
  },
  
  generatedAt: nowIso
};

return [{
  json: {
    manifest,
    orderId: amazonOrderId,
    characterHash: manifest.characterHash,
    pagePreviewImages,
    pageImageUrls, // Now prioritizes Cloudflare Images URLs
    coverImage: manifest.pngGeneration.coverSpreadImage,
    coverPdfR2Key: coverPdfKey,
    // Include Cloudflare Images summary
    cloudflareImagesSummary: {
      totalPages: cloudflareImagesData.length,
      pagesWithCloudflare: cloudflareImagesData.filter(cf => cf.cloudflareImageId).length,
      coverHasCloudflare: !!coverCloudflareImageId
    }
  }
}];
```

## Issue 2: W3 Not Using Flipped Images

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

