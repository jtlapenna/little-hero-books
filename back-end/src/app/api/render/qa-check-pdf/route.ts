import { NextRequest, NextResponse } from 'next/server';
import { PNG } from 'pngjs';

import { verifyBearerAuth } from '@/lib/auth';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

type PdfType = 'interior' | 'cover';

interface QaRequestBody {
  orderId: string;
  pdfR2Key: string;
  expectedPageCount: number;
  type?: PdfType;
}

interface PageResult {
  page: number;
  hasImage: boolean;
  imageBytes: number;
  whiteSpaceRatio: number | null;
  previewMeanAbsDiff?: number | null;
  previewTopHalfMeanAbsDiff?: number | null;
  previewBottomHalfMeanAbsDiff?: number | null;
  passed: boolean;
  failReasons: string[];
  warnings?: string[];
}

interface ExtractedPdfImage {
  page: number;
  width: number;
  height: number;
  compressedBytes: number;
  data: Uint8Array;
}

interface PdfJsOperatorList {
  fnArray: number[];
  argsArray: unknown[][];
}

interface PdfJsObjs {
  get: (name: string, callback?: (obj: unknown) => void) => unknown;
  has?: (name: string) => boolean;
}

interface PdfJsPage {
  getOperatorList: () => Promise<PdfJsOperatorList>;
  objs: PdfJsObjs;
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
}

interface PdfJsModule {
  GlobalWorkerOptions?: { workerSrc?: string };
  OPS?: Record<string, number>;
  getDocument: (options: {
    data: Uint8Array;
    useWorkerFetch?: boolean;
    disableWorker?: boolean;
  }) => { promise: Promise<PdfJsDocument> };
}

export const maxDuration = 60;

const MAX_PAGES = 40;
const MIN_BYTES_PER_PAGE = 30_000;
const MIN_IMAGE_BYTES = 50_000;
const WHITE_SPACE_THRESHOLD = 0.4;
const THUMBNAIL_SIZE = 200;
const PREVIEW_DIFF_THRESHOLD = 20;
const PREVIEW_HALF_DIFF_THRESHOLD = 25;
const PREVIEW_HALF_IMBALANCE_THRESHOLD = 15;
const PREVIEW_STRONG_MATCH_THRESHOLD = 5;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseInput(body: unknown): { ok: true; data: QaRequestBody } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'Invalid JSON body' };

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const pdfR2Key = typeof body.pdfR2Key === 'string' ? body.pdfR2Key.trim() : '';
  const expectedPageCountRaw = Number(body.expectedPageCount);
  const typeRaw = typeof body.type === 'string' ? body.type : 'interior';

  if (!orderId) return { ok: false, error: 'orderId is required' };
  if (!pdfR2Key) return { ok: false, error: 'pdfR2Key is required' };
  if (!Number.isFinite(expectedPageCountRaw) || expectedPageCountRaw < 1 || expectedPageCountRaw > MAX_PAGES) {
    return { ok: false, error: `expectedPageCount must be between 1 and ${MAX_PAGES}` };
  }
  if (typeRaw !== 'interior' && typeRaw !== 'cover') {
    return { ok: false, error: 'type must be interior or cover' };
  }

  return {
    ok: true,
    data: {
      orderId,
      pdfR2Key,
      expectedPageCount: Math.floor(expectedPageCountRaw),
      type: typeRaw,
    },
  };
}

function inferChannels(dataLength: number, width: number, height: number): number | null {
  const px = width * height;
  if (!px || !Number.isFinite(px)) return null;
  const channels = Math.floor(dataLength / px);
  if (channels === 1 || channels === 2 || channels === 3 || channels === 4) return channels;
  return null;
}

async function computeWhiteSpaceRatio(
  imageData: Uint8Array,
  width: number,
  height: number
): Promise<number | null> {
  try {
    const channels = inferChannels(imageData.byteLength, width, height);
    if (!channels) return null;
    const sampleWidth = Math.min(THUMBNAIL_SIZE, width);
    const sampleHeight = Math.min(THUMBNAIL_SIZE, height);
    if (sampleWidth <= 0 || sampleHeight <= 0) return null;

    let whiteCount = 0;
    let totalPixels = 0;

    for (let y = 0; y < sampleHeight; y += 1) {
      const srcY = Math.min(height - 1, Math.floor((y * height) / sampleHeight));
      for (let x = 0; x < sampleWidth; x += 1) {
        const srcX = Math.min(width - 1, Math.floor((x * width) / sampleWidth));
        const idx = (srcY * width + srcX) * channels;
        if (idx < 0 || idx + channels > imageData.length) continue;

        const r = imageData[idx];
        const g = channels >= 3 ? imageData[idx + 1] : r;
        const b = channels >= 3 ? imageData[idx + 2] : r;

        if (r > 240 && g > 240 && b > 240) whiteCount += 1;
        totalPixels += 1;
      }
    }

    if (totalPixels <= 0) return null;
    return whiteCount / totalPixels;
  } catch {
    return null;
  }
}

async function getPdfJsLib() {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    const workerOptions = (mod as unknown as PdfJsModule).GlobalWorkerOptions;
    // Required by pdfjs-dist in Node runtime to avoid fake-worker init errors.
    if (workerOptions && !workerOptions.workerSrc) {
      workerOptions.workerSrc = '/pdf.worker.mjs';
    }
  } catch {
    // no-op
  }
  return mod as unknown as PdfJsModule;
}

function jsonFail(status: number, payload: Record<string, unknown>) {
  return NextResponse.json({ passed: false, ...payload }, { status });
}

function countRegexMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function buildInteriorPageNames(expectedPageCount: number): string[] {
  return Array.from({ length: expectedPageCount }, (_, i) => 'p' + String(i).padStart(2, '0'));
}

function buildExpectedPreviewKey(orderId: string, type: PdfType, page: number, expectedPageCount: number): string {
  if (type === 'cover') {
    return `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`;
  }
  const pageNames = buildInteriorPageNames(expectedPageCount);
  const pageName = pageNames[page - 1];
  return `book-mvp-simple-adventure/orders/${orderId}/preview-images/${pageName}.png`;
}

async function inflatePdfStream(stream: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate');
    const decompressed = await new Response(
      new Blob([stream]).stream().pipeThrough(ds)
    ).arrayBuffer();
    return new Uint8Array(decompressed);
  }

  const zlib = await import('node:zlib');
  return zlib.inflateSync(Buffer.from(stream));
}

function extractFlateImageStreams(pdfArray: ArrayBuffer): {
  images: ExtractedPdfImage[];
  warnings: string[];
} {
  const pdfBuffer = Buffer.from(pdfArray);
  const pdfText = pdfBuffer.toString('latin1');
  const images: ExtractedPdfImage[] = [];
  const warnings: string[] = [];

  let searchStart = 0;
  while (true) {
    const imageIdx = pdfText.indexOf('/Subtype /Image', searchStart);
    if (imageIdx === -1) break;

    const dictStart = pdfText.lastIndexOf('<<', imageIdx);
    const streamIdx = pdfText.indexOf('stream', imageIdx);
    if (dictStart === -1 || streamIdx === -1 || streamIdx - dictStart > 2000) {
      searchStart = imageIdx + 1;
      continue;
    }

    const dictText = pdfText.slice(dictStart, streamIdx);
    const width = Number(dictText.match(/\/Width\s+(\d+)/)?.[1] || 0);
    const height = Number(dictText.match(/\/Height\s+(\d+)/)?.[1] || 0);
    const length = Number(dictText.match(/\/Length\s+(\d+)/)?.[1] || 0);
    const filter = dictText.match(/\/Filter\s*\/([A-Za-z0-9]+)/)?.[1] || '';
    const bitsPerComponent = Number(dictText.match(/\/BitsPerComponent\s+(\d+)/)?.[1] || 0);

    if (!width || !height || !length || filter !== 'FlateDecode' || bitsPerComponent !== 8) {
      searchStart = streamIdx + 6;
      continue;
    }

    let streamStart = streamIdx + 6;
    if (pdfText[streamStart] === '\r' && pdfText[streamStart + 1] === '\n') streamStart += 2;
    else if (pdfText[streamStart] === '\n') streamStart += 1;

    const streamEnd = streamStart + length;
    if (streamEnd > pdfBuffer.length) {
      warnings.push(`image_stream_truncated_at_page_${images.length + 1}`);
      break;
    }

    images.push({
      page: images.length + 1,
      width,
      height,
      compressedBytes: length,
      data: pdfBuffer.subarray(streamStart, streamEnd),
    });

    searchStart = streamEnd;
  }

  return { images, warnings };
}

function sampleRgbNearest(
  imageData: Uint8Array,
  width: number,
  height: number,
  targetWidth = THUMBNAIL_SIZE,
  targetHeight = THUMBNAIL_SIZE
): Uint8Array {
  const channels = inferChannels(imageData.byteLength, width, height);
  if (!channels || channels < 3) {
    throw new Error(`Unable to infer RGB channels for ${width}x${height}`);
  }

  const out = new Uint8Array(targetWidth * targetHeight * 3);
  let outIdx = 0;
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y * height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / targetWidth));
      const srcIdx = (srcY * width + srcX) * channels;
      out[outIdx++] = imageData[srcIdx];
      out[outIdx++] = imageData[srcIdx + 1];
      out[outIdx++] = imageData[srcIdx + 2];
    }
  }
  return out;
}

function computeSampleMeanAbsDiff(
  left: Uint8Array,
  right: Uint8Array,
  startRow = 0,
  endRow = THUMBNAIL_SIZE
): number {
  if (left.length !== right.length) throw new Error('Sample buffers must match length');
  const width = THUMBNAIL_SIZE;
  const start = startRow * width * 3;
  const end = Math.min(left.length, endRow * width * 3);
  let total = 0;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    total += Math.abs(left[i] - right[i]);
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

async function decodePreviewPngSample(key: string): Promise<{
  sample: Uint8Array;
  whiteSpaceRatio: number | null;
}> {
  const response = await getObject(R2_ORDERS_BUCKET, key);
  const pngBuffer = Buffer.from(await response.arrayBuffer());
  const decoded = PNG.sync.read(pngBuffer, { skipRescale: true });
  const { width, height, data } = decoded;
  const sample = new Uint8Array(THUMBNAIL_SIZE * THUMBNAIL_SIZE * 3);
  let outIdx = 0;
  for (let y = 0; y < THUMBNAIL_SIZE; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y * height) / THUMBNAIL_SIZE));
    for (let x = 0; x < THUMBNAIL_SIZE; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / THUMBNAIL_SIZE));
      const srcIdx = (srcY * width + srcX) * 4;
      sample[outIdx++] = data[srcIdx];
      sample[outIdx++] = data[srcIdx + 1];
      sample[outIdx++] = data[srcIdx + 2];
    }
  }

  let whiteCount = 0;
  for (let i = 0; i < sample.length; i += 3) {
    if (sample[i] > 240 && sample[i + 1] > 240 && sample[i + 2] > 240) whiteCount += 1;
  }

  return {
    sample,
    whiteSpaceRatio: whiteCount / (THUMBNAIL_SIZE * THUMBNAIL_SIZE),
  };
}

function fallbackAnalyzePdfBytes(pdfArray: ArrayBuffer): {
  pageCount: number;
  hasImage: boolean;
  imageBytesEstimate: number;
} | null {
  try {
    const text = Buffer.from(pdfArray).toString('latin1');
    // Heuristic page count from /Type /Page tokens
    const pageCount = countRegexMatches(text, /\/Type\s*\/Page\b/g);
    // Heuristic image presence from /Subtype /Image tokens
    const imageCount = countRegexMatches(text, /\/Subtype\s*\/Image\b/g);
    let imageBytesEstimate = 0;
    const lengthRe = /\/Subtype\s*\/Image[\s\S]{0,600}?\/Length\s+(\d+)/g;
    for (const match of text.matchAll(lengthRe)) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > imageBytesEstimate) imageBytesEstimate = n;
    }
    if (!Number.isFinite(pageCount) || pageCount <= 0) return null;
    return {
      pageCount,
      hasImage: imageCount > 0,
      imageBytesEstimate,
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (process.env.BACKEND_API_TOKEN) {
    const auth = verifyBearerAuth(request);
    if (!auth.ok) return jsonFail(401, { reasonCode: 'unauthorized', reason: auth.error || 'Unauthorized' });
  }

  const startedAt = Date.now();

  try {
    const input = parseInput(await request.json().catch(() => null));
    if (!input.ok) return jsonFail(400, { reasonCode: 'invalid_input', reason: input.error });

    const { orderId, pdfR2Key, expectedPageCount, type = 'interior' } = input.data;

    let pdfArray: ArrayBuffer;
    try {
      const r2Response = await getObject(R2_ORDERS_BUCKET, pdfR2Key);
      pdfArray = await r2Response.arrayBuffer();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const isNotFound =
        message.includes('404') || message.includes('NoSuchKey') || message.includes('Not Found');
      return jsonFail(isNotFound ? 404 : 500, {
        orderId,
        type,
        pdfR2Key,
        reasonCode: isNotFound ? 'pdf_not_found' : 'pdf_download_failed',
        reason: isNotFound ? 'PDF not found in R2' : 'Failed to download PDF from R2',
      });
    }

    const totalPdfBytes = pdfArray.byteLength;
    if (totalPdfBytes <= 0) {
      return jsonFail(422, {
        orderId,
        type,
        pdfR2Key,
        reasonCode: 'pdf_empty',
        reason: 'Downloaded PDF has zero bytes',
      });
    }
    if (totalPdfBytes < expectedPageCount * MIN_BYTES_PER_PAGE) {
      return jsonFail(422, {
        orderId,
        type,
        pdfR2Key,
        totalPdfBytes,
        expectedPageCount,
        reasonCode: 'pdf_too_small',
        reason: `PDF size below minimum heuristic (${MIN_BYTES_PER_PAGE} bytes/page)`,
      });
    }

    const extracted = extractFlateImageStreams(pdfArray);
    if (extracted.images.length === expectedPageCount) {
      const pages: PageResult[] = [];
      const failedPages: number[] = [];
      const warnings = [...extracted.warnings, 'direct_image_stream_compare_used'];
      const previewCache = new Map<string, { sample: Uint8Array; whiteSpaceRatio: number | null }>();

      for (const image of extracted.images) {
        const pageWarnings: string[] = [];
        const failReasons: string[] = [];
        let rawImage: Uint8Array;
        let pdfWhiteSpaceRatio: number | null = null;
        let previewMeanAbsDiff: number | null = null;
        let previewTopHalfMeanAbsDiff: number | null = null;
        let previewBottomHalfMeanAbsDiff: number | null = null;

        try {
          rawImage = await inflatePdfStream(image.data);
        } catch (error) {
          throw new Error(`Failed to inflate embedded page image ${image.page}: ${getErrorMessage(error)}`);
        }

        const sample = sampleRgbNearest(rawImage, image.width, image.height);
        pdfWhiteSpaceRatio = await computeWhiteSpaceRatio(rawImage, image.width, image.height);

        try {
          const previewKey = buildExpectedPreviewKey(orderId, type, image.page, expectedPageCount);
          let preview = previewCache.get(previewKey);
          if (!preview) {
            preview = await decodePreviewPngSample(previewKey);
            previewCache.set(previewKey, preview);
          }

          previewMeanAbsDiff = computeSampleMeanAbsDiff(sample, preview.sample);
          previewTopHalfMeanAbsDiff = computeSampleMeanAbsDiff(sample, preview.sample, 0, THUMBNAIL_SIZE / 2);
          previewBottomHalfMeanAbsDiff = computeSampleMeanAbsDiff(sample, preview.sample, THUMBNAIL_SIZE / 2, THUMBNAIL_SIZE);

          if (previewMeanAbsDiff > PREVIEW_DIFF_THRESHOLD) {
            failReasons.push(`preview_diff_too_high:${previewMeanAbsDiff.toFixed(2)}>${PREVIEW_DIFF_THRESHOLD}`);
          }
          if (
            Math.max(previewTopHalfMeanAbsDiff, previewBottomHalfMeanAbsDiff) > PREVIEW_HALF_DIFF_THRESHOLD &&
            Math.abs(previewTopHalfMeanAbsDiff - previewBottomHalfMeanAbsDiff) > PREVIEW_HALF_IMBALANCE_THRESHOLD
          ) {
            failReasons.push(
              `preview_half_diff_imbalance:${previewTopHalfMeanAbsDiff.toFixed(2)}/${previewBottomHalfMeanAbsDiff.toFixed(2)}`
            );
          }
        } catch (error) {
          pageWarnings.push(`preview_compare_unavailable:${getErrorMessage(error)}`);
          warnings.push(`page_${image.page}:preview_compare_unavailable`);
        }

        const hasStrongPreviewMatch =
          previewMeanAbsDiff !== null && previewMeanAbsDiff <= PREVIEW_STRONG_MATCH_THRESHOLD;

        if (!hasStrongPreviewMatch && image.compressedBytes < MIN_IMAGE_BYTES) {
          failReasons.push(`image_bytes_too_small:${image.compressedBytes}<${MIN_IMAGE_BYTES}`);
        }
        if (!hasStrongPreviewMatch && pdfWhiteSpaceRatio !== null && pdfWhiteSpaceRatio > WHITE_SPACE_THRESHOLD) {
          failReasons.push(`white_space_ratio_too_high:${pdfWhiteSpaceRatio.toFixed(3)}>${WHITE_SPACE_THRESHOLD}`);
        }

        const passed = failReasons.length === 0;
        if (!passed) failedPages.push(image.page);

        pages.push({
          page: image.page,
          hasImage: true,
          imageBytes: image.compressedBytes,
          whiteSpaceRatio: pdfWhiteSpaceRatio,
          previewMeanAbsDiff,
          previewTopHalfMeanAbsDiff,
          previewBottomHalfMeanAbsDiff,
          passed,
          failReasons,
          ...(pageWarnings.length ? { warnings: pageWarnings } : {}),
        });
      }

      const passed = failedPages.length === 0;
      const durationMs = Date.now() - startedAt;
      const avgBytesPerPage = Math.floor(totalPdfBytes / Math.max(expectedPageCount, 1));

      return NextResponse.json(
        {
          passed,
          orderId,
          type,
          pdfR2Key,
          reasonCode: passed ? 'all_passed' : 'page_checks_failed',
          reason: passed ? 'all_passed' : `Failed pages: ${failedPages.join(', ')}`,
          pageCount: expectedPageCount,
          expectedPageCount,
          totalPdfBytes,
          avgBytesPerPage,
          failedPages,
          pages,
          warnings,
          durationMs,
        },
        { status: 200 }
      );
    }

    const pdfjs = await getPdfJsLib();
    const OPS = pdfjs.OPS || {};

    let pdfDoc: PdfJsDocument | null = null;
    let usedFallbackParser = false;
    try {
      const task = pdfjs.getDocument({
        data: new Uint8Array(pdfArray),
        useWorkerFetch: false,
        disableWorker: true,
      });
      pdfDoc = await task.promise;
    } catch (error: unknown) {
      const fallback = fallbackAnalyzePdfBytes(pdfArray);
      if (!fallback) {
        return jsonFail(422, {
          orderId,
          type,
          pdfR2Key,
          reasonCode: 'pdf_parse_error',
          reason: getErrorMessage(error) || 'Failed to parse PDF',
        });
      }
      usedFallbackParser = true;
      const pageCount = fallback.pageCount;
      if (pageCount !== expectedPageCount) {
        return jsonFail(422, {
          orderId,
          type,
          pdfR2Key,
          pageCount,
          expectedPageCount,
          reasonCode: 'page_count_mismatch',
          reason: `PDF page count mismatch (${pageCount} vs expected ${expectedPageCount})`,
          warnings: ['fallback_parser_used'],
        });
      }
      const failReasons: string[] = [];
      if (!fallback.hasImage) failReasons.push('no_image_on_page');
      if (fallback.imageBytesEstimate > 0 && fallback.imageBytesEstimate < MIN_IMAGE_BYTES) {
        failReasons.push(`image_bytes_too_small:${fallback.imageBytesEstimate}<${MIN_IMAGE_BYTES}`);
      }
      const failedPages = failReasons.length ? [1] : [];
      const durationMs = Date.now() - startedAt;
      return NextResponse.json(
        {
          passed: failedPages.length === 0,
          orderId,
          type,
          pdfR2Key,
          reasonCode: failedPages.length ? 'page_checks_failed' : 'all_passed',
          reason: failedPages.length ? `Failed pages: ${failedPages.join(', ')}` : 'all_passed',
          pageCount,
          expectedPageCount,
          totalPdfBytes,
          avgBytesPerPage: Math.floor(totalPdfBytes / Math.max(pageCount, 1)),
          failedPages,
          pages: Array.from({ length: pageCount }, (_, i) => ({
            page: i + 1,
            hasImage: fallback.hasImage,
            imageBytes: fallback.imageBytesEstimate,
            whiteSpaceRatio: null,
            passed: failReasons.length === 0,
            failReasons,
            warnings: ['fallback_parser_used'],
          })),
          warnings: ['fallback_parser_used'],
          durationMs,
        },
        { status: 200 }
      );
    }

    const pageCount = Number(pdfDoc?.numPages || 0);
    if (pageCount !== expectedPageCount) {
      return jsonFail(422, {
        orderId,
        type,
        pdfR2Key,
        pageCount,
        expectedPageCount,
        reasonCode: 'page_count_mismatch',
        reason: `PDF page count mismatch (${pageCount} vs expected ${expectedPageCount})`,
      });
    }

    const pages: PageResult[] = [];
    const failedPages: number[] = [];
    const warnings: string[] = [];

    const imageOpFns = new Set<number>([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintJpegXObject,
    ].filter((n) => Number.isFinite(n)));

    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      const page = await pdfDoc!.getPage(pageNum);
      const operatorList = await page.getOperatorList();
      const fnArray = Array.isArray(operatorList.fnArray) ? operatorList.fnArray : [];
      const argsArray = Array.isArray(operatorList.argsArray) ? operatorList.argsArray : [];

      const imageNames: string[] = [];
      for (let i = 0; i < fnArray.length; i += 1) {
        const fn = fnArray[i];
        if (!imageOpFns.has(fn)) continue;
        const arg0 = argsArray[i]?.[0];
        if (typeof arg0 === 'string' && arg0) imageNames.push(arg0);
      }
      const uniqueImageNames = Array.from(new Set(imageNames));
      const hasImage = uniqueImageNames.length > 0;

      let bestImageBytes = 0;
      let whiteSpaceRatio: number | null = null;
      const pageWarnings: string[] = [];

      // Best-effort extraction from pdfjs object cache.
      // If unavailable, we still keep Tier 1 checks based on draw ops.
      for (const name of uniqueImageNames) {
        let imageObj: unknown = null;
        try {
          imageObj = await new Promise<unknown>((resolve) => {
            let settled = false;
            const done = (v: unknown) => {
              if (settled) return;
              settled = true;
              resolve(v ?? null);
            };
            const timeout = setTimeout(() => done(null), 200);
            try {
              page.objs.get(name, (obj: unknown) => {
                clearTimeout(timeout);
                done(obj);
              });
              if (typeof page.objs.has === 'function' && page.objs.has(name)) {
                try {
                  const immediate = page.objs.get(name);
                  if (immediate) {
                    clearTimeout(timeout);
                    done(immediate);
                  }
                } catch {
                  // no-op
                }
              }
            } catch {
              clearTimeout(timeout);
              done(null);
            }
          });
        } catch {
          imageObj = null;
        }

        const imageRecord = isRecord(imageObj) ? imageObj : null;
        const rawData = imageRecord?.data;
        const data: Uint8Array | null = rawData
          ? new Uint8Array(
              (rawData as ArrayLike<number> & { buffer?: ArrayBuffer }).buffer || (rawData as ArrayLike<number>),
              (rawData as { byteOffset?: number }).byteOffset || 0,
              (rawData as { byteLength?: number; length?: number }).byteLength ||
                (rawData as { length?: number }).length ||
                0
            )
          : null;
        const width = Number((imageRecord?.width as number | undefined) || 0);
        const height = Number((imageRecord?.height as number | undefined) || 0);
        const bytes = data?.byteLength || 0;

        if (bytes > bestImageBytes) bestImageBytes = bytes;

        if (data && width > 0 && height > 0 && whiteSpaceRatio === null) {
          whiteSpaceRatio = await computeWhiteSpaceRatio(data, width, height);
        }
      }

      if (hasImage && bestImageBytes === 0) {
        pageWarnings.push('image_extract_unavailable');
        warnings.push(`page_${pageNum}: image_extract_unavailable`);
      }

      const failReasons: string[] = [];
      if (!hasImage) {
        failReasons.push('no_image_on_page');
      }
      if (hasImage && bestImageBytes > 0 && bestImageBytes < MIN_IMAGE_BYTES) {
        failReasons.push(`image_bytes_too_small:${bestImageBytes}<${MIN_IMAGE_BYTES}`);
      }
      if (whiteSpaceRatio !== null && whiteSpaceRatio > WHITE_SPACE_THRESHOLD) {
        failReasons.push(`white_space_ratio_too_high:${whiteSpaceRatio.toFixed(3)}>${WHITE_SPACE_THRESHOLD}`);
      }

      const pagePassed = failReasons.length === 0;
      if (!pagePassed) failedPages.push(pageNum);

      pages.push({
        page: pageNum,
        hasImage,
        imageBytes: bestImageBytes,
        whiteSpaceRatio,
        passed: pagePassed,
        failReasons,
        ...(pageWarnings.length ? { warnings: pageWarnings } : {}),
      });
    }

    const passed = failedPages.length === 0;
    const durationMs = Date.now() - startedAt;
    const avgBytesPerPage = Math.floor(totalPdfBytes / Math.max(pageCount, 1));
    const reasonCode = passed ? 'all_passed' : 'page_checks_failed';
    const reason = passed
      ? 'all_passed'
      : `Failed pages: ${failedPages.join(', ')}`;

    if (usedFallbackParser) warnings.push('fallback_parser_used');

    return NextResponse.json(
      {
        passed,
        orderId,
        type,
        pdfR2Key,
        reasonCode,
        reason,
        pageCount,
        expectedPageCount,
        totalPdfBytes,
        avgBytesPerPage,
        failedPages,
        pages,
        ...(warnings.length ? { warnings } : {}),
        durationMs,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return jsonFail(500, {
      reasonCode: 'internal_error',
      reason: getErrorMessage(error) || 'Internal error',
    });
  }
}
