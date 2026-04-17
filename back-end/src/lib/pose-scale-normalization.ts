import { decode, encode } from 'fast-png';
import { getObject, putObject } from '@/lib/r2-client';
import { buildPoseReferenceAssetKey, extractBookIdFromPathLike } from '@/lib/order-paths';
import { getBucketFromKey } from '@/lib/r2-utils';

const ALPHA_THRESHOLD = 128;
const SCALE_TOLERANCE = 0.05;
const VERTICAL_OFFSET_TOLERANCE = 0.03;
const HORIZONTAL_OFFSET_TOLERANCE = 0.03;

type DecodedPng = Pick<
  ReturnType<typeof decode>,
  'width' | 'height' | 'data' | 'channels' | 'depth'
>;

interface BBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface NormalizePoseScaleInput {
  imageKey: string;
  poseNumber: number;
  bookId?: string | null;
  characterHash?: string | null;
}

export interface NormalizePoseScaleResult {
  success: true;
  normalized: boolean;
  imageKey: string;
  refKey: string;
  poseNumber: number;
  bookId: string;
  message: string;
  scaleFactor: number | null;
  verticalOffset: number | null;
  horizontalOffset: number | null;
  sourceBBoxFound: boolean;
  referenceBBoxFound: boolean;
}

export type NormalizePoseScaleFn = (
  input: NormalizePoseScaleInput,
) => Promise<NormalizePoseScaleResult>;

function inferBackground(png: DecodedPng) {
  const { width, height, data, channels } = png;
  const bpp = channels;
  const corner = (x: number, y: number) => {
    const i = (y * width + x) * bpp;
    const r = data[i];
    const g = channels >= 3 ? data[i + 1] : r;
    const b = channels >= 3 ? data[i + 2] : r;
    return { r, g, b };
  };
  const c1 = corner(0, 0);
  const c2 = corner(width - 1, 0);
  const c3 = corner(0, height - 1);
  const c4 = corner(width - 1, height - 1);
  return {
    r: (c1.r + c2.r + c3.r + c4.r) / 4,
    g: (c1.g + c2.g + c3.g + c4.g) / 4,
    b: (c1.b + c2.b + c3.b + c4.b) / 4,
  };
}

function alphaAt(png: DecodedPng, x: number, y: number): number {
  const i = (y * png.width + x) * png.channels;
  if (png.channels === 4) return png.data[i + 3];
  if (png.channels === 2) return png.data[i + 1];
  return 255;
}

function rgbAt(png: DecodedPng, x: number, y: number) {
  const i = (y * png.width + x) * png.channels;
  const r = png.data[i];
  const g = png.channels >= 3 ? png.data[i + 1] : r;
  const b = png.channels >= 3 ? png.data[i + 2] : r;
  return { r, g, b };
}

function isNearBg(
  rgb: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
) {
  return Math.abs(rgb.r - bg.r) <= 12 &&
    Math.abs(rgb.g - bg.g) <= 12 &&
    Math.abs(rgb.b - bg.b) <= 12;
}

function hasMeaningfulTransparency(png: DecodedPng) {
  const hasAlpha = png.channels === 4 || png.channels === 2;
  if (!hasAlpha) return false;
  const { width, height } = png;
  const sample = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
  ] as const;
  return sample.some(([x, y]) => alphaAt(png, x, y) < 20);
}

type BgClassifier = {
  isBg: (x: number, y: number) => boolean;
};

function buildBgClassifier(png: DecodedPng): BgClassifier {
  const bg = inferBackground(png);
  const useAlpha = hasMeaningfulTransparency(png);
  if (useAlpha) {
    return { isBg: (x, y) => alphaAt(png, x, y) <= ALPHA_THRESHOLD };
  }

  const grid = 160;
  const w = png.width;
  const h = png.height;
  const cells = new Uint8Array(grid * grid);
  const seen = new Uint8Array(grid * grid);

  const isCellBgCandidate = (cx: number, cy: number) => {
    const x = Math.min(w - 1, Math.floor(((cx + 0.5) * w) / grid));
    const y = Math.min(h - 1, Math.floor(((cy + 0.5) * h) / grid));
    if (alphaAt(png, x, y) <= ALPHA_THRESHOLD) return true;
    return isNearBg(rgbAt(png, x, y), bg);
  };

  const qx = new Int16Array(grid * grid);
  const qy = new Int16Array(grid * grid);
  let qh = 0;
  let qt = 0;
  const push = (cx: number, cy: number) => {
    const idx = cy * grid + cx;
    if (seen[idx]) return;
    seen[idx] = 1;
    if (!isCellBgCandidate(cx, cy)) return;
    cells[idx] = 1;
    qx[qt] = cx;
    qy[qt] = cy;
    qt += 1;
  };

  for (let x = 0; x < grid; x += 1) {
    push(x, 0);
    push(x, grid - 1);
  }
  for (let y = 0; y < grid; y += 1) {
    push(0, y);
    push(grid - 1, y);
  }

  while (qh < qt) {
    const cx = qx[qh];
    const cy = qy[qh];
    qh += 1;
    if (cx > 0) push(cx - 1, cy);
    if (cx + 1 < grid) push(cx + 1, cy);
    if (cy > 0) push(cx, cy - 1);
    if (cy + 1 < grid) push(cx, cy + 1);
  }

  return {
    isBg: (x, y) => {
      const cx = Math.min(grid - 1, Math.floor((x * grid) / w));
      const cy = Math.min(grid - 1, Math.floor((y * grid) / h));
      const idx = cy * grid + cx;
      if (!cells[idx]) return false;
      if (alphaAt(png, x, y) <= ALPHA_THRESHOLD) return true;
      return isNearBg(rgbAt(png, x, y), bg);
    },
  };
}

function readRgba(png: DecodedPng, x: number, y: number): [number, number, number, number] {
  const i = (y * png.width + x) * png.channels;
  if (png.channels === 4) return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
  if (png.channels === 2) {
    const v = png.data[i];
    return [v, v, v, png.data[i + 1]];
  }
  const v = png.data[i] ?? 0;
  return [v, v, v, 255];
}

function writeRgba(
  out: Uint8Array,
  outWidth: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  const di = (y * outWidth + x) * 4;
  out[di] = r;
  out[di + 1] = g;
  out[di + 2] = b;
  out[di + 3] = a;
}

function opaqueBoundingBox(png: DecodedPng): BBox | null {
  const { width, height } = png;
  const { isBg } = buildBgClassifier(png);
  const rowCounts = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(png, x, y) > ALPHA_THRESHOLD && !isBg(x, y)) count += 1;
    }
    rowCounts[y] = count;
  }

  let maxRowCount = 0;
  for (let y = 0; y < height; y += 1) {
    if (rowCounts[y] > maxRowCount) maxRowCount = rowCounts[y];
  }
  if (maxRowCount === 0) return null;

  const rowMin = Math.max(1, Math.floor(maxRowCount * 0.01));
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  for (let y = 0; y < height; y += 1) {
    if (rowCounts[y] < rowMin) continue;
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(png, x, y) > ALPHA_THRESHOLD && !isBg(x, y)) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < top) return null;
  return {
    top,
    bottom,
    left,
    right,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function normalizeImage(
  srcPng: DecodedPng,
  srcBox: BBox,
  refBox: BBox,
  refPng: DecodedPng,
): DecodedPng {
  const canvasW = srcPng.width;
  const canvasH = srcPng.height;
  const { isBg: srcIsBg } = buildBgClassifier(srcPng);

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
  const dstBottom = Math.round(mappedRef.bottom);
  const dstTop = dstBottom - scaledH + 1;
  const refCenterX = (mappedRef.left + mappedRef.right) / 2;
  const dstLeft = Math.round(refCenterX - scaledW / 2);

  const outData = new Uint8Array(canvasW * canvasH * 4);
  for (let dy = 0; dy < scaledH; dy += 1) {
    const outY = dstTop + dy;
    if (outY < 0 || outY >= canvasH) continue;
    const srcY = srcBox.top + Math.min(Math.floor(dy / scale), srcBox.height - 1);

    for (let dx = 0; dx < scaledW; dx += 1) {
      const outX = dstLeft + dx;
      if (outX < 0 || outX >= canvasW) continue;
      const srcX = srcBox.left + Math.min(Math.floor(dx / scale), srcBox.width - 1);
      if (alphaAt(srcPng, srcX, srcY) <= ALPHA_THRESHOLD || srcIsBg(srcX, srcY)) continue;
      const [r, g, b, a] = readRgba(srcPng, srcX, srcY);
      writeRgba(outData, canvasW, outX, outY, r, g, b, a);
    }
  }

  return {
    width: canvasW,
    height: canvasH,
    data: outData,
    channels: 4,
    depth: 8,
  };
}

export async function normalizePoseScaleAsset(
  input: NormalizePoseScaleInput,
): Promise<NormalizePoseScaleResult> {
  const imageKey = input.imageKey.trim();
  if (!imageKey) {
    throw new Error('normalizePoseScaleAsset requires imageKey');
  }
  if (!Number.isFinite(input.poseNumber) || input.poseNumber < 0) {
    throw new Error('normalizePoseScaleAsset requires a non-negative poseNumber');
  }

  const resolvedBookId =
    (typeof input.bookId === 'string' && input.bookId.trim()) ||
    extractBookIdFromPathLike(imageKey);
  if (!resolvedBookId) {
    throw new Error(`Unable to resolve bookId for pose ${input.poseNumber} from ${imageKey}`);
  }

  const refKey = buildPoseReferenceAssetKey(resolvedBookId, input.poseNumber);
  const imageBucket = getBucketFromKey(imageKey);
  const refBucket = getBucketFromKey(refKey);
  const [imageResp, refResp] = await Promise.all([
    getObject(imageBucket, imageKey),
    getObject(refBucket, refKey),
  ]);

  const [imageBuf, refBuf] = await Promise.all([
    imageResp.arrayBuffer(),
    refResp.arrayBuffer(),
  ]);

  const imagePng = decode(new Uint8Array(imageBuf));
  const refPng = decode(new Uint8Array(refBuf));
  const genBox = opaqueBoundingBox(imagePng);
  const refBox = opaqueBoundingBox(refPng);

  if (!genBox || !refBox) {
    return {
      success: true,
      normalized: false,
      imageKey,
      refKey,
      poseNumber: input.poseNumber,
      bookId: resolvedBookId,
      message: 'Could not compute bounding box',
      scaleFactor: null,
      verticalOffset: null,
      horizontalOffset: null,
      sourceBBoxFound: Boolean(genBox),
      referenceBBoxFound: Boolean(refBox),
    };
  }

  const yScale = imagePng.height / refPng.height;
  const xScale = imagePng.width / refPng.width;
  const mappedRefHeight = refBox.height * yScale;
  const mappedRefBottom = refBox.bottom * yScale;
  const mappedRefCenterX = ((refBox.left + refBox.right) / 2) * xScale;
  const genCenterX = (genBox.left + genBox.right) / 2;
  const scaleFactor = mappedRefHeight / genBox.height;
  const verticalOffset = Math.abs(genBox.bottom - mappedRefBottom) / imagePng.height;
  const horizontalOffset = Math.abs(genCenterX - mappedRefCenterX) / imagePng.width;

  if (
    Math.abs(1 - scaleFactor) < SCALE_TOLERANCE &&
    verticalOffset < VERTICAL_OFFSET_TOLERANCE &&
    horizontalOffset < HORIZONTAL_OFFSET_TOLERANCE
  ) {
    return {
      success: true,
      normalized: false,
      imageKey,
      refKey,
      poseNumber: input.poseNumber,
      bookId: resolvedBookId,
      message: 'Already within tolerance',
      scaleFactor,
      verticalOffset,
      horizontalOffset,
      sourceBBoxFound: true,
      referenceBBoxFound: true,
    };
  }

  const normalizedPng = normalizeImage(imagePng, genBox, refBox, refPng);
  const normalizedBytes = encode({
    width: normalizedPng.width,
    height: normalizedPng.height,
    data: normalizedPng.data,
    channels: 4,
    depth: 8,
  });

  await putObject(imageBucket, imageKey, normalizedBytes, 'image/png');

  return {
    success: true,
    normalized: true,
    imageKey,
    refKey,
    poseNumber: input.poseNumber,
    bookId: resolvedBookId,
    message: 'Image scaled and repositioned to match reference',
    scaleFactor,
    verticalOffset,
    horizontalOffset,
    sourceBBoxFound: true,
    referenceBBoxFound: true,
  };
}
