/** Build 3A Manifest: interiors + cover + assetsUsed + Cloudflare Images (Phase 4)
 *
 * Supports:
 * - HTML → PNG interiors
 * - HTML → PNG cover spread (flattened)
 * - Cloudflare Images for pages & cover (pageNumber, pageType)
 * - Backwards compatible with legacy coverPdf keys (if present)
 */
const base = $input.first()?.json || {};

// ---------------------------------------------------------------------------
// Phase-1 context (safe reads)
// ---------------------------------------------------------------------------
let inputs = {};
let renderCtx = {};
try {
  const norm = $items('Normalize Inputs (3A Phase 1)1', 0, $runIndex)?.[0]?.json;
  if (norm?.inputs) inputs = norm.inputs;
} catch {}

try {
  const res = $items('Resolve Asset Paths (3A Phase 1)1', 0, $runIndex)?.[0]?.json;
  if (res?.renderContext) renderCtx = res.renderContext;
} catch {}

const amazonOrderId =
  base.amazonOrderId ||
  base.orderId ||
  inputs.orderId ||
  null;

if (!amazonOrderId) {
  throw new Error('amazonOrderId/orderId is required');
}

// ---------------------------------------------------------------------------
// Page preview images
// Expectation: upstream "Collect Page Preview Images" feeds pagePreviewImages
// into this node's input. We do NOT hard-reference that node here.
// ---------------------------------------------------------------------------
const pagePreviewImages = Array.isArray(base.pagePreviewImages)
  ? base.pagePreviewImages
  : [];

console.log('[Build 3A Manifest] pagePreviewImages count:', pagePreviewImages.length);

// ---------------------------------------------------------------------------
// Cloudflare Images map
//   Sources:
//     - Store Cloudflare Images ID1 (pages)
//     - Store Cloudflare Images ID  (cover)
// ---------------------------------------------------------------------------
let cloudflareImagesData = [];

function pushCloudflareFrom(nodeName) {
  try {
    const out = $items(nodeName, 0, $runIndex);
    if (Array.isArray(out)) {
      out.forEach(i => {
        if (i?.json) cloudflareImagesData.push(i.json);
      });
    } else if (out?.json) {
      cloudflareImagesData.push(out.json);
    }
  } catch (e) {
    // Node might not exist or might not run on this path; that's fine.
  }
}

// Interiors path
pushCloudflareFrom('Store Cloudflare Images ID1');
// Cover path
pushCloudflareFrom('Store Cloudflare Images ID');

const cloudflareMap = new Map();
let coverCloudflareImageId = null;
let coverCloudflareImageUrl = null;

cloudflareImagesData.forEach(cf => {
  if (!cf) return;
  const pageType = cf.pageType || cf.type || null;
  const pageNumRaw =
    cf.pageNumber !== undefined ? cf.pageNumber : cf.pageNum;
  const cfId  = cf.cloudflareImageId || null;
  const cfUrl = cf.cloudflareImageUrl || null;

  // COVER-SPREAD: pageType:'cover-spread' OR pageNumber:-1
  if (pageType === 'cover-spread' || Number(pageNumRaw) === -1) {
    if (cfId || cfUrl) {
      coverCloudflareImageId  = cfId  || coverCloudflareImageId;
      coverCloudflareImageUrl = cfUrl || coverCloudflareImageUrl;
      cloudflareMap.set(-1, {
        cloudflareImageId: cfId,
        cloudflareImageUrl: cfUrl,
      });
    }
    return;
  }

  // Interior pages (0..N)
  const pageNum = Number(pageNumRaw);
  if (!Number.isFinite(pageNum)) return;

  const existing = cloudflareMap.get(pageNum) || {};
  cloudflareMap.set(pageNum, {
    cloudflareImageId: cfId || existing.cloudflareImageId || null,
    cloudflareImageUrl: cfUrl || existing.cloudflareImageUrl || null,
  });
});

// Merge any CF info already attached on pagePreviewImages
pagePreviewImages.forEach(p => {
  const pageNum = Number(p.pageNumber);
  if (!Number.isFinite(pageNum)) return;

  const cfId  = p.cloudflareImageId;
  const cfUrl = p.cloudflareImageUrl;
  if (!cfId && !cfUrl) return;

  const existing = cloudflareMap.get(pageNum) || {};
  cloudflareMap.set(pageNum, {
    cloudflareImageId: cfId || existing.cloudflareImageId || null,
    cloudflareImageUrl: cfUrl || existing.cloudflareImageUrl || null,
  });
});

// ---------------------------------------------------------------------------
// pageImageUrls for W4 (Cloudflare preferred → R2 → direct URL)
//   Interiors only; cover handled separately.
// ---------------------------------------------------------------------------
const backendBase = base.backendUrl || 'https://admin.littleherolabs.com';

const pageImageUrls = pagePreviewImages
  .map(p => {
    const pageNum = Number(p.pageNumber ?? p.pageIndex ?? 0);
    const cfData = cloudflareMap.get(pageNum);
    if (cfData?.cloudflareImageUrl) return cfData.cloudflareImageUrl;
    if (p.r2Key) return `${backendBase}/api/assets/${p.r2Key}`;
    return p.imageUrl || null;
  })
  .filter(Boolean);

// ---------------------------------------------------------------------------
// COVER (PNG) KEYS — flattened cover spread
// ---------------------------------------------------------------------------
let coverImageKey = null;
try {
  const fromSet =
    $items('Set Cover PNG Filenames/Keys', 0, $runIndex)?.[0]?.json || {};
  if (fromSet.coverPngR2Key) coverImageKey = fromSet.coverPngR2Key;
} catch {}

try {
  const fromUpload =
    $items('Upload Cover Preview Image to R2 (3A1)', 0, $runIndex)?.[0]?.json || {};
  if (!coverImageKey && fromUpload.coverPngR2Key) {
    coverImageKey = fromUpload.coverPngR2Key;
  }
} catch {}

// Also accept if already on input
if (!coverImageKey && base.coverPngR2Key) {
  coverImageKey = base.coverPngR2Key;
}

// If no explicit CF cover yet, try from map(-1)
if (!coverCloudflareImageId && !coverCloudflareImageUrl) {
  const coverCfData = cloudflareMap.get(-1) || null;
  if (coverCfData) {
    coverCloudflareImageId  = coverCfData.cloudflareImageId || null;
    coverCloudflareImageUrl = coverCfData.cloudflareImageUrl || null;
  }
}

// No active cover PDF nodes yet — keep backward compat only if present on input
const coverPdfKey = base.coverPdfR2Key || null;

// ---------------------------------------------------------------------------
// Pages map (R2 keys) + pagesWithCloudflare
// ---------------------------------------------------------------------------
const pages = {};
const pagesWithCloudflare = {};

// Page 0 (dedication) - REMOVED: Only use p00_dedication, not p00
// This eliminates redundancy and makes the manifest cleaner
let page0Processed = false;
for (const p of pagePreviewImages) {
  const pageNum = Number(p.pageNumber);
  if (pageNum === 0) {
    const key =
      p.r2Key ||
      p.pageImageR2Key ||
      p.imageR2Key ||
      p.key ||
      p.path ||
      null;

    if (key) {
      // REMOVED: pages.p00 = key; (redundant with p00_dedication)
      pages.p00_dedication = key;  // Keep only the semantic key
      page0Processed = true;

      const cfData =
        cloudflareMap.get(0) || {
          cloudflareImageId: p.cloudflareImageId || null,
          cloudflareImageUrl: p.cloudflareImageUrl || null,
        };

      if (cfData.cloudflareImageId || cfData.cloudflareImageUrl) {
        const entry = {
          cloudflareImageId: cfData.cloudflareImageId || null,
          cloudflareImageUrl: cfData.cloudflareImageUrl || null,
        };

        // REMOVED: pagesWithCloudflare.p00 = entry; (redundant with p00_dedication)
        pagesWithCloudflare.p00_dedication = entry;  // Keep only the semantic key
      }
    }
    break;
  }
}

if (!page0Processed) {
  console.warn(
    '[Build 3A Manifest] PAGE 0 not found. pageNumbers:',
    pagePreviewImages.map(p => p.pageNumber),
  );
}

// Pages 1–14
pagePreviewImages.forEach(p => {
  const n = Number(p.pageNumber);
  if (!Number.isFinite(n) || n < 1 || n > 14) return;

  const key =
    p.r2Key ||
    p.pageImageR2Key ||
    p.imageR2Key ||
    p.key ||
    p.path ||
    null;

  if (!key) return;

  const id = n < 10 ? `p0${n}` : `p${n}`;
  pages[id] = key;

  const cfData =
    cloudflareMap.get(n) || {
      cloudflareImageId: p.cloudflareImageId || null,
      cloudflareImageUrl: p.cloudflareImageUrl || null,
    };

  if (cfData.cloudflareImageId || cfData.cloudflareImageUrl) {
    pagesWithCloudflare[id] = {
      cloudflareImageId: cfData.cloudflareImageId || null,
      cloudflareImageUrl: cfData.cloudflareImageUrl || null,
    };
  }
});

// ---------------------------------------------------------------------------
// Assets used
// ---------------------------------------------------------------------------
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
  font:         renderCtx?.font || 'book-mvp-simple-adventure/fonts/custom-font.ttf',
  coversBg:     renderCtx?.coversBg || 'book-mvp-simple-adventure/backgrounds/page00-covers.png',
  dedicationBg: renderCtx?.dedicationBg || 'book-mvp-simple-adventure/backgrounds/page00-dedication.png',
  pose00:       renderCtx?.pose00 || null,
  overlays:     overlaysUsed,
};

// ---------------------------------------------------------------------------
// Manifest assembly
// ---------------------------------------------------------------------------
const nowIso = new Date().toISOString();

const manifest = {
  schema: 'lhb.run-manifest@v2.0',
  runStamp: nowIso,
  characterHash: base.characterHash || null,
  amazonOrderId,

  pngGeneration: {
    sizeInterior: { w: 2625, h: 2625 },
    sizeCover:    { w: 5203, h: 2625 },
    pages,
    pagesWithCloudflare,
    coverSpreadImage: coverImageKey || null,
    coverCloudflareImageId: coverCloudflareImageId || null,
    coverCloudflareImageUrl: coverCloudflareImageUrl || null,
  },

  pdfGeneration: {
    coverPdf: coverPdfKey || null,
  },

  assetsUsed,
  pages,

  summary: {
    percentComplete: 100,
    readyForBook: true,
    needsHumanReview: true,
  },

  generatedAt: nowIso,
};

console.log(
  '[Build 3A Manifest] FINAL pages:',
  Object.keys(manifest.pngGeneration.pages),
);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
return [
  {
    json: {
      manifest,
      orderId: amazonOrderId,
      characterHash: manifest.characterHash,
      pagePreviewImages,
      pageImageUrls,
      coverImage: manifest.pngGeneration.coverSpreadImage,
      coverPngR2Key: coverImageKey || null,
      coverPdfR2Key: coverPdfKey || null,
      coverCloudflareImageId: coverCloudflareImageId || null,
      coverCloudflareImageUrl: coverCloudflareImageUrl || null,
      cloudflareImagesSummary: {
        totalItems: cloudflareImagesData.length,
        pagesWithCloudflare: Object.keys(pagesWithCloudflare).length,
        coverHasCloudflare: !!coverCloudflareImageId,
      },
    },
  },
];


