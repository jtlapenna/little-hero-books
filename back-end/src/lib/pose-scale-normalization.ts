import { decode, encode } from 'fast-png';
import { getObject, putObject } from '@/lib/r2-client';
import { buildPoseReferenceAssetKey, extractBookIdFromPathLike } from '@/lib/order-paths';
import { getBucketFromKey } from '@/lib/r2-utils';

const ALPHA_THRESHOLD = 128;
const DEFAULT_TOLERANCE = {
  scale: 0.05,
  verticalOffset: 0.03,
  horizontalOffset: 0.03,
  groundContactOffset: 0.03,
} as const;

const STRICT_TOLERANCE = {
  scale: 0.01,
  verticalOffset: 0.005,
  horizontalOffset: 0.005,
  groundContactOffset: 0.005,
} as const;

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

interface GroundContactBand {
  row: number;
  left: number;
  right: number;
  width: number;
  depth: number;
}

export type NormalizePoseScaleMode = 'default' | 'strict';

export interface PoseAnchorMetrics {
  groundContactY: number;
  centerlineX: number;
  groundContactCenterX: number;
  groundContactWidth: number;
  headToFeetSpan: number;
}

export interface PoseScaleDiagnostics {
  scaleFactor: number;
  verticalOffset: number;
  horizontalOffset: number;
  groundContactOffset: number;
  sourceAnchorMetrics: PoseAnchorMetrics;
  referenceAnchorMetrics: PoseAnchorMetrics;
}

export interface NormalizePoseScaleInput {
  imageKey: string;
  poseNumber: number;
  bookId?: string | null;
  characterHash?: string | null;
  mode?: NormalizePoseScaleMode | null;
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
  groundContactOffset: number | null;
  sourceAnchorMetrics: PoseAnchorMetrics | null;
  referenceAnchorMetrics: PoseAnchorMetrics | null;
  sourceBBoxFound: boolean;
  referenceBBoxFound: boolean;
}

export type NormalizePoseScaleFn = (
  input: NormalizePoseScaleInput,
) => Promise<NormalizePoseScaleResult>;

export interface PoseScaleInspectionResult {
  success: true;
  imageKey: string;
  refKey: string;
  poseNumber: number;
  bookId: string;
  sourceCanvas: { width: number; height: number };
  referenceCanvas: { width: number; height: number };
  sourceBBoxFound: boolean;
  referenceBBoxFound: boolean;
  diagnostics: PoseScaleDiagnostics | null;
}

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

function computeOpaqueRowCounts(
  png: DecodedPng,
  isBg: BgClassifier['isBg'],
): Uint32Array {
  const { width, height } = png;
  const rowCounts = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(png, x, y) > ALPHA_THRESHOLD && !isBg(x, y)) count += 1;
    }
    rowCounts[y] = count;
  }

  return rowCounts;
}

function resolveOpaqueRowMinimum(rowCounts: Uint32Array): number {
  let maxRowCount = 0;
  for (let y = 0; y < rowCounts.length; y += 1) {
    if (rowCounts[y] > maxRowCount) maxRowCount = rowCounts[y];
  }
  if (maxRowCount === 0) return 0;

  return Math.max(1, Math.floor(maxRowCount * 0.01));
}

function opaqueBoundingBox(
  png: DecodedPng,
  isBg: BgClassifier['isBg'],
  rowCounts: Uint32Array,
  rowMin: number,
): BBox | null {
  const { width, height } = png;
  if (rowMin === 0) return null;

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

function detectGroundContactBand(
  png: DecodedPng,
  isBg: BgClassifier['isBg'],
  rowCounts: Uint32Array,
  rowMin: number,
  box: BBox,
): GroundContactBand {
  const bandDepth = Math.max(1, Math.min(12, Math.round(box.height * 0.03)));
  const bandTop = Math.max(box.top, box.bottom - bandDepth + 1);
  let left = png.width;
  let right = -1;
  let top = box.bottom;
  let bottom = box.bottom;

  for (let y = box.bottom; y >= bandTop; y -= 1) {
    if (rowCounts[y] < rowMin) continue;

    let rowHasPixels = false;
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, x, y) <= ALPHA_THRESHOLD || isBg(x, y)) continue;
      rowHasPixels = true;
      if (x < left) left = x;
      if (x > right) right = x;
    }

    if (rowHasPixels) {
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left) {
    return {
      row: box.bottom,
      left: box.left,
      right: box.right,
      width: box.width,
      depth: 1,
    };
  }

  return {
    row: bottom,
    left,
    right,
    width: right - left + 1,
    depth: bottom - top + 1,
  };
}

function analyzeOpaqueSilhouette(
  png: DecodedPng,
): { box: BBox; groundContactBand: GroundContactBand } | null {
  const { isBg } = buildBgClassifier(png);
  const rowCounts = computeOpaqueRowCounts(png, isBg);
  const rowMin = resolveOpaqueRowMinimum(rowCounts);
  const box = opaqueBoundingBox(png, isBg, rowCounts, rowMin);
  if (!box) {
    return null;
  }

  return {
    box,
    groundContactBand: detectGroundContactBand(
      png,
      isBg,
      rowCounts,
      rowMin,
      box,
    ),
  };
}

export function computePoseAnchorMetrics(
  box: Pick<BBox, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>,
  canvas: { width: number; height: number },
  groundContactBand?: Pick<GroundContactBand, 'row' | 'left' | 'right' | 'width'>,
): PoseAnchorMetrics {
  const contact = groundContactBand ?? {
    row: box.bottom,
    left: box.left,
    right: box.right,
    width: box.width,
  };

  return {
    groundContactY: contact.row / canvas.height,
    centerlineX: (box.left + box.right) / 2 / canvas.width,
    groundContactCenterX: (contact.left + contact.right) / 2 / canvas.width,
    groundContactWidth: contact.width / canvas.width,
    headToFeetSpan: (contact.row - box.top + 1) / canvas.height,
  };
}

export function computePoseScaleDiagnostics(input: {
  sourceBox: BBox;
  referenceBox: BBox;
  sourceCanvas: { width: number; height: number };
  referenceCanvas: { width: number; height: number };
  sourceGroundContactBand?: GroundContactBand;
  referenceGroundContactBand?: GroundContactBand;
}): PoseScaleDiagnostics {
  const sourceAnchorMetrics = computePoseAnchorMetrics(
    input.sourceBox,
    input.sourceCanvas,
    input.sourceGroundContactBand,
  );
  const referenceAnchorMetrics = computePoseAnchorMetrics(
    input.referenceBox,
    input.referenceCanvas,
    input.referenceGroundContactBand,
  );

  return {
    scaleFactor:
      referenceAnchorMetrics.headToFeetSpan / sourceAnchorMetrics.headToFeetSpan,
    verticalOffset:
      Math.abs(
        sourceAnchorMetrics.groundContactY - referenceAnchorMetrics.groundContactY,
      ),
    horizontalOffset:
      Math.abs(sourceAnchorMetrics.centerlineX - referenceAnchorMetrics.centerlineX),
    groundContactOffset:
      Math.abs(
        sourceAnchorMetrics.groundContactCenterX -
          referenceAnchorMetrics.groundContactCenterX,
      ),
    sourceAnchorMetrics,
    referenceAnchorMetrics,
  };
}

function normalizeImage(
  srcPng: DecodedPng,
  srcBox: BBox,
  srcGroundContactBand: GroundContactBand,
  refBox: BBox,
  refGroundContactBand: GroundContactBand,
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
  const mappedRefGroundRow = refGroundContactBand.row * yScale;
  const mappedRefGroundCenterX =
    ((refGroundContactBand.left + refGroundContactBand.right) / 2) * xScale;
  const srcGroundRow = srcGroundContactBand.row;
  const srcGroundCenterX =
    (srcGroundContactBand.left + srcGroundContactBand.right) / 2;

  const srcGroundOffsetY = srcGroundRow - srcBox.top;
  const srcGroundOffsetX = srcGroundCenterX - srcBox.left;
  const mappedRefSpan = mappedRefGroundRow - mappedRef.top + 1;
  const srcSpan = srcGroundOffsetY + 1;
  const scale = mappedRefSpan / srcSpan;
  const scaledW = Math.round(srcBox.width * scale);
  const scaledH = Math.round(srcBox.height * scale);
  const dstGroundRow = Math.round(mappedRefGroundRow);
  const dstTop = Math.round(dstGroundRow - srcGroundOffsetY * scale);
  const dstLeft = Math.round(mappedRefGroundCenterX - srcGroundOffsetX * scale);

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

function normalizeMode(value: NormalizePoseScaleMode | null | undefined): NormalizePoseScaleMode {
  return value === 'strict' ? 'strict' : 'default';
}

function getNormalizePoseScaleTolerance(
  mode: NormalizePoseScaleMode,
) {
  return mode === 'strict' ? STRICT_TOLERANCE : DEFAULT_TOLERANCE;
}

export function shouldNormalizePoseScale(
  diagnostics: PoseScaleDiagnostics,
  mode: NormalizePoseScaleMode = 'default',
): boolean {
  const tolerance = getNormalizePoseScaleTolerance(mode);
  return (
    Math.abs(1 - diagnostics.scaleFactor) >= tolerance.scale ||
    diagnostics.verticalOffset >= tolerance.verticalOffset ||
    diagnostics.horizontalOffset >= tolerance.horizontalOffset ||
    diagnostics.groundContactOffset >= tolerance.groundContactOffset
  );
}

async function loadPoseScaleInspectionState(
  input: NormalizePoseScaleInput,
): Promise<{
  imageKey: string;
  refKey: string;
  bookId: string;
  imageBucket: string;
  imagePng: DecodedPng;
  refPng: DecodedPng;
  generatedSilhouette: ReturnType<typeof analyzeOpaqueSilhouette>;
  referenceSilhouette: ReturnType<typeof analyzeOpaqueSilhouette>;
  sourceBox: BBox | null;
  referenceBox: BBox | null;
  diagnostics: PoseScaleDiagnostics | null;
}> {
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
  const generatedSilhouette = analyzeOpaqueSilhouette(imagePng);
  const referenceSilhouette = analyzeOpaqueSilhouette(refPng);
  const sourceBox = generatedSilhouette?.box ?? null;
  const referenceBox = referenceSilhouette?.box ?? null;
  const diagnostics =
    sourceBox && referenceBox
      ? computePoseScaleDiagnostics({
          sourceBox,
          referenceBox,
          sourceCanvas: {
            width: imagePng.width,
            height: imagePng.height,
          },
          referenceCanvas: {
            width: refPng.width,
            height: refPng.height,
          },
          sourceGroundContactBand: generatedSilhouette?.groundContactBand,
          referenceGroundContactBand: referenceSilhouette?.groundContactBand,
        })
      : null;

  return {
    imageKey,
    refKey,
    bookId: resolvedBookId,
    imageBucket,
    imagePng,
    refPng,
    generatedSilhouette,
    referenceSilhouette,
    sourceBox,
    referenceBox,
    diagnostics,
  };
}

export async function inspectPoseScaleAsset(
  input: NormalizePoseScaleInput,
): Promise<PoseScaleInspectionResult> {
  const state = await loadPoseScaleInspectionState(input);
  return {
    success: true,
    imageKey: state.imageKey,
    refKey: state.refKey,
    poseNumber: input.poseNumber,
    bookId: state.bookId,
    sourceCanvas: {
      width: state.imagePng.width,
      height: state.imagePng.height,
    },
    referenceCanvas: {
      width: state.refPng.width,
      height: state.refPng.height,
    },
    sourceBBoxFound: Boolean(state.sourceBox),
    referenceBBoxFound: Boolean(state.referenceBox),
    diagnostics: state.diagnostics,
  };
}

export async function normalizePoseScaleAsset(
  input: NormalizePoseScaleInput,
): Promise<NormalizePoseScaleResult> {
  const mode = normalizeMode(input.mode);
  const state = await loadPoseScaleInspectionState(input);
  const {
    imageKey,
    refKey,
    bookId: resolvedBookId,
    imageBucket,
    imagePng,
    refPng,
    generatedSilhouette,
    referenceSilhouette,
    sourceBox: genBox,
    referenceBox: refBox,
    diagnostics,
  } = state;

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
      groundContactOffset: null,
      sourceAnchorMetrics: genBox
        ? computePoseAnchorMetrics(genBox, {
            width: imagePng.width,
            height: imagePng.height,
          }, generatedSilhouette?.groundContactBand)
        : null,
      referenceAnchorMetrics: refBox
        ? computePoseAnchorMetrics(refBox, {
            width: refPng.width,
            height: refPng.height,
          }, referenceSilhouette?.groundContactBand)
        : null,
      sourceBBoxFound: Boolean(genBox),
      referenceBBoxFound: Boolean(refBox),
    };
  }

  if (!shouldNormalizePoseScale(diagnostics, mode)) {
    return {
      success: true,
      normalized: false,
      imageKey,
      refKey,
      poseNumber: input.poseNumber,
      bookId: resolvedBookId,
      message: 'Already within tolerance',
      scaleFactor: diagnostics.scaleFactor,
      verticalOffset: diagnostics.verticalOffset,
      horizontalOffset: diagnostics.horizontalOffset,
      groundContactOffset: diagnostics.groundContactOffset,
      sourceAnchorMetrics: diagnostics.sourceAnchorMetrics,
      referenceAnchorMetrics: diagnostics.referenceAnchorMetrics,
      sourceBBoxFound: true,
      referenceBBoxFound: true,
    };
  }

  const normalizedPng = normalizeImage(
    imagePng,
    genBox,
    generatedSilhouette.groundContactBand,
    refBox,
    referenceSilhouette.groundContactBand,
    refPng,
  );
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
    scaleFactor: diagnostics.scaleFactor,
    verticalOffset: diagnostics.verticalOffset,
    horizontalOffset: diagnostics.horizontalOffset,
    groundContactOffset: diagnostics.groundContactOffset,
    sourceAnchorMetrics: diagnostics.sourceAnchorMetrics,
    referenceAnchorMetrics: diagnostics.referenceAnchorMetrics,
    sourceBBoxFound: true,
    referenceBBoxFound: true,
  };
}
