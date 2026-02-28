import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

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
  passed: boolean;
  failReasons: string[];
  warnings?: string[];
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

const MAX_PAGES = 40;
const MIN_BYTES_PER_PAGE = 30_000;
const MIN_IMAGE_BYTES = 50_000;
const WHITE_SPACE_THRESHOLD = 0.4;
const THUMBNAIL_SIZE = 200;

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

    const thumbnail = await sharp(Buffer.from(imageData), {
      raw: { width, height, channels },
    })
      .ensureAlpha()
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer();

    const totalPixels = thumbnail.length / 4;
    if (totalPixels <= 0) return null;

    let whiteCount = 0;
    for (let i = 0; i < thumbnail.length; i += 4) {
      const r = thumbnail[i];
      const g = thumbnail[i + 1];
      const b = thumbnail[i + 2];
      if (r > 240 && g > 240 && b > 240) whiteCount += 1;
    }
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

