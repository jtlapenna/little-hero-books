import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject } from '@/lib/r2-client';
import { extractR2Key, getBucketFromKey } from '@/lib/r2-utils';
import { PNG } from 'pngjs';

export const maxDuration = 30;

const ALPHA_THRESHOLD = 128;
// Skip normalization when scale and position are already close enough
const SCALE_TOLERANCE = 0.05;    // 5 %
const OFFSET_TOLERANCE = 0.03;   // 3 % of image height

// -----------------------------------------------------------------
// Bounding-box helpers
// -----------------------------------------------------------------

interface BBox { top: number; bottom: number; left: number; right: number; width: number; height: number; }

/**
 * Compute the trimmed bounding box of opaque pixels.
 * Rows/columns with fewer opaque pixels than 1% of the densest row are
 * treated as stray artifacts and excluded.
 */
function opaqueBoundingBox(png: PNG): BBox | null {
  const { width, height, data } = png;

  // Per-row opaque pixel count (used to filter stray rows)
  const rowCounts = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) count++;
    }
    rowCounts[y] = count;
  }

  const maxRowCount = Math.max(...rowCounts);
  if (maxRowCount === 0) return null;
  const rowMin = Math.max(1, Math.floor(maxRowCount * 0.01));

  let top = height, bottom = -1, left = width, right = -1;

  for (let y = 0; y < height; y++) {
    if (rowCounts[y] < rowMin) continue;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < top) return null;
  return { top, bottom, left, right, width: right - left + 1, height: bottom - top + 1 };
}

// -----------------------------------------------------------------
// Nearest-neighbour scaling + repositioning
// -----------------------------------------------------------------

function normalizeImage(
  srcPng: PNG,
  srcBox: BBox,
  refBox: BBox,
  refPng: PNG,
): PNG {
  const { width: canvasW, height: canvasH } = srcPng;

  // Map refBox from reference image coords → generated image coords
  const xScale = canvasW / refPng.width;
  const yScale = canvasH / refPng.height;
  const mappedRef = {
    top: refBox.top * yScale,
    bottom: refBox.bottom * yScale,
    left: refBox.left * xScale,
    right: refBox.right * xScale,
    height: refBox.height * yScale,
    width: refBox.width * xScale,
  };

  const scale = mappedRef.height / srcBox.height;

  const scaledW = Math.round(srcBox.width * scale);
  const scaledH = Math.round(srcBox.height * scale);

  // Bottom-anchor: align feet rows
  const dstBottom = Math.round(mappedRef.bottom);
  const dstTop = dstBottom - scaledH + 1;

  // Center horizontally: align midpoints
  const refCenterX = (mappedRef.left + mappedRef.right) / 2;
  const dstLeft = Math.round(refCenterX - scaledW / 2);

  const out = new PNG({ width: canvasW, height: canvasH });
  // Canvas starts fully transparent (all zeros)
  out.data.fill(0);

  for (let dy = 0; dy < scaledH; dy++) {
    const outY = dstTop + dy;
    if (outY < 0 || outY >= canvasH) continue;

    // Source row via nearest-neighbour
    const srcY = srcBox.top + Math.min(Math.floor(dy / scale), srcBox.height - 1);

    for (let dx = 0; dx < scaledW; dx++) {
      const outX = dstLeft + dx;
      if (outX < 0 || outX >= canvasW) continue;

      const srcX = srcBox.left + Math.min(Math.floor(dx / scale), srcBox.width - 1);

      const si = (srcY * canvasW + srcX) * 4;
      const di = (outY * canvasW + outX) * 4;

      out.data[di]     = srcPng.data[si];
      out.data[di + 1] = srcPng.data[si + 1];
      out.data[di + 2] = srcPng.data[si + 2];
      out.data[di + 3] = srcPng.data[si + 3];
    }
  }

  return out;
}

// -----------------------------------------------------------------
// POST handler
// -----------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, poseNumber, characterHash } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing imageUrl' });
    }
    if (typeof poseNumber !== 'number' || poseNumber < 0) {
      return NextResponse.json({ success: false, error: 'Missing or invalid poseNumber' });
    }

    const poseNN = String(poseNumber).padStart(2, '0');
    const tag = `[NormScale pose${poseNN} ${characterHash ?? ''}]`;

    // ── Resolve R2 keys ──
    const imageKey = extractR2Key(imageUrl);
    if (!imageKey) {
      return NextResponse.json({ success: false, error: `Cannot extract R2 key from imageUrl: ${imageUrl}` });
    }

    const refKey = `book-mvp-simple-adventure/characters/poses/pose${poseNN}.png`;
    const imageBucket = getBucketFromKey(imageKey);
    const refBucket = getBucketFromKey(refKey);

    // ── Download both images ──
    console.log(`${tag} Downloading images…`);
    let imageResp: Response;
    let refResp: Response;
    try {
      [imageResp, refResp] = await Promise.all([
        getObject(imageBucket, imageKey),
        getObject(refBucket, refKey),
      ]);
    } catch (err: any) {
      console.error(`${tag} R2 download failed:`, err?.message);
      return NextResponse.json({ success: false, error: `R2 download failed: ${err?.message}` });
    }

    const imageBuf = Buffer.from(await imageResp.arrayBuffer());
    const refBuf = Buffer.from(await refResp.arrayBuffer());

    // ── Parse PNGs ──
    let imagePng: PNG;
    let refPng: PNG;
    try {
      imagePng = PNG.sync.read(imageBuf);
      refPng = PNG.sync.read(refBuf);
    } catch (err: any) {
      console.error(`${tag} PNG parse failed:`, err?.message);
      return NextResponse.json({ success: false, error: `PNG parse failed: ${err?.message}` });
    }

    // ── Compute bounding boxes ──
    const genBox = opaqueBoundingBox(imagePng);
    const refBox = opaqueBoundingBox(refPng);

    if (!genBox || !refBox) {
      console.log(`${tag} Could not compute bounding box (no opaque pixels)`);
      return NextResponse.json({
        success: true, normalized: false,
        message: 'Could not compute bounding box',
        _debug: { genBox, refBox },
      });
    }

    // Map reference bbox to generated image's coordinate space for comparison
    const yScale = imagePng.height / refPng.height;
    const mappedRefHeight = refBox.height * yScale;
    const mappedRefBottom = refBox.bottom * yScale;

    const scaleFactor = mappedRefHeight / genBox.height;
    const verticalOffset = Math.abs(genBox.bottom - mappedRefBottom) / imagePng.height;

    console.log(`${tag} genBox=${JSON.stringify(genBox)} refBox=${JSON.stringify(refBox)} imgDims=${imagePng.width}x${imagePng.height} refDims=${refPng.width}x${refPng.height} scale=${scaleFactor.toFixed(3)} vOffset=${verticalOffset.toFixed(3)}`);

    // ── Check if normalization is needed ──
    if (Math.abs(1 - scaleFactor) < SCALE_TOLERANCE && verticalOffset < OFFSET_TOLERANCE) {
      console.log(`${tag} Within tolerance — skipping`);
      return NextResponse.json({
        success: true, normalized: false,
        message: 'Already within tolerance',
        _debug: { scaleFactor, verticalOffset, genBox, refBox },
      });
    }

    // ── Normalize ──
    console.log(`${tag} Normalizing (scale=${scaleFactor.toFixed(3)}, vOffset=${verticalOffset.toFixed(3)})…`);
    const normalizedPng = normalizeImage(imagePng, genBox, refBox, refPng);
    const normalizedBuf = PNG.sync.write(normalizedPng);

    // ── Overwrite in R2 ──
    await putObject(imageBucket, imageKey, normalizedBuf, 'image/png');
    console.log(`${tag} Overwritten in R2 (${imageBuf.length} → ${normalizedBuf.length} bytes)`);

    const xRatio = imagePng.width / refPng.width;
    const mappedRefCenterX = (refBox.left + refBox.right) / 2 * xRatio;
    const genCenterX = (genBox.left + genBox.right) / 2;

    return NextResponse.json({
      success: true,
      normalized: true,
      scaleFactor: Math.round(scaleFactor * 1000) / 1000,
      translation: {
        x: Math.round(mappedRefCenterX - genCenterX),
        y: Math.round(mappedRefBottom - genBox.bottom),
      },
      message: 'Image scaled and repositioned to match reference',
      _debug: { genBox, refBox, scaleFactor, verticalOffset, imgDims: [imagePng.width, imagePng.height], refDims: [refPng.width, refPng.height] },
    });
  } catch (err: any) {
    console.error('[NormScale] Unexpected error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unexpected error' });
  }
}
