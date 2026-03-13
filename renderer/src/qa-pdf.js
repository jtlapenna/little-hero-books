import crypto from 'node:crypto';

import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import sharp from 'sharp';

const DEFAULT_MAX_RENDERED_PAGES = 2;
const DEFAULT_SCALE = 1;
const DEFAULT_RENDER_MODE = 'first_last';
const MAX_PAGE_COUNT = 100;

const THUMBNAIL_SIZE = 200;
const WHITE_SPACE_THRESHOLD = 0.4;
const PREVIEW_DIFF_THRESHOLD = 20;
const PREVIEW_HALF_DIFF_THRESHOLD = 25;
const PREVIEW_HALF_IMBALANCE_THRESHOLD = 15;
const PREVIEW_STRONG_MATCH_THRESHOLD = 5;

let pdfjsPromise = null;

function createQaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function installPdfRenderGlobals() {
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2D;
}

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      installPdfRenderGlobals();

      const [{ WorkerMessageHandler }, pdfjs] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
        import('pdfjs-dist/legacy/build/pdf.mjs'),
      ]);

      // Pre-register the main-thread worker handler so pdfjs never falls back
      // to importing "./pdf.worker.mjs" via a runtime-resolved workerSrc path.
      globalThis.pdfjsWorker = {
        ...(globalThis.pdfjsWorker || {}),
        WorkerMessageHandler,
      };

      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

function normalizeRenderMode(value) {
  return value === 'all' ? 'all' : DEFAULT_RENDER_MODE;
}

function normalizeMaxRenderedPages(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_RENDERED_PAGES;
  return Math.min(Math.floor(parsed), MAX_PAGE_COUNT);
}

function normalizeScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCALE;
  return Math.min(Math.max(parsed, 0.25), 4);
}

function normalizeExpectedPageCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_PAGE_COUNT) {
    throw createQaError('invalid_input', `expectedPageCount must be between 1 and ${MAX_PAGE_COUNT}`);
  }
  return Math.floor(parsed);
}

function normalizePreviewImageUrls(value, expectedPageCount) {
  if (!Array.isArray(value) || value.length !== expectedPageCount) {
    throw createQaError(
      'invalid_input',
      `previewImageUrls must contain exactly ${expectedPageCount} entries`
    );
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw createQaError('invalid_input', `previewImageUrls[${index}] must be a non-empty string`);
    }
    return entry.trim();
  });
}

function normalizeType(value) {
  if (value === 'interior' || value === 'cover') return value;
  throw createQaError('invalid_input', 'type must be interior or cover');
}

function normalizePageLabels(value, expectedPageCount) {
  if (!Array.isArray(value) || value.length !== expectedPageCount) {
    return Array.from({ length: expectedPageCount }, (_, index) => String(index + 1));
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) return String(index + 1);
    return entry.trim();
  });
}

function getPageNumbers(pageCount, renderMode, maxRenderedPages) {
  if (pageCount < 1) return [];
  if (renderMode === 'all') {
    return Array.from({ length: Math.min(pageCount, maxRenderedPages) }, (_, index) => index + 1);
  }
  if (pageCount === 1) return [1];
  return [1, pageCount];
}

function inferChannels(dataLength, width, height) {
  const px = width * height;
  if (!px || !Number.isFinite(px)) return null;
  const channels = Math.floor(dataLength / px);
  if (channels === 1 || channels === 2 || channels === 3 || channels === 4) return channels;
  return null;
}

function sampleRgbNearest(imageData, width, height, targetWidth = THUMBNAIL_SIZE, targetHeight = THUMBNAIL_SIZE) {
  const channels = inferChannels(imageData.length, width, height);
  if (!channels || channels < 3) {
    throw createQaError('image_decode_error', `Unable to infer RGB channels for ${width}x${height}`);
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

function computeWhiteSpaceRatio(sample) {
  if (!sample || !sample.length) return null;

  let whiteCount = 0;
  for (let i = 0; i < sample.length; i += 3) {
    if (sample[i] > 240 && sample[i + 1] > 240 && sample[i + 2] > 240) whiteCount += 1;
  }

  return whiteCount / (THUMBNAIL_SIZE * THUMBNAIL_SIZE);
}

function computeSampleMeanAbsDiff(left, right, startRow = 0, endRow = THUMBNAIL_SIZE) {
  if (left.length !== right.length) {
    throw createQaError('internal_error', 'Sample buffers must have the same length');
  }

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

async function decodePreviewImageSample(previewImageUrl) {
  let response;
  try {
    response = await fetch(previewImageUrl, { method: 'GET', cache: 'no-store' });
  } catch (error) {
    throw createQaError(
      'preview_fetch_failed',
      `Failed to fetch preview image ${previewImageUrl}: ${getErrorMessage(error)}`
    );
  }

  if (!response.ok) {
    throw createQaError(
      'preview_fetch_failed',
      `Preview image fetch failed (${response.status}) for ${previewImageUrl}`
    );
  }

  let rawBuffer;
  try {
    const inputBuffer = Buffer.from(await response.arrayBuffer());
    rawBuffer = await sharp(inputBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
  } catch (error) {
    throw createQaError(
      'image_decode_error',
      `Failed to decode preview image ${previewImageUrl}: ${getErrorMessage(error)}`
    );
  }

  const sample = new Uint8Array(rawBuffer);
  return {
    sample,
    whiteSpaceRatio: computeWhiteSpaceRatio(sample),
  };
}

async function renderPageToPng(pdfDoc, pageNumber, scale) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  const renderTask = page.render({
    canvasContext: context,
    viewport,
  });

  await renderTask.promise;

  const pngBuffer = canvas.toBuffer('image/png');
  const sha256 = crypto.createHash('sha256').update(pngBuffer).digest('hex');

  try {
    page.cleanup();
  } catch {
    // no-op
  }

  return {
    page: pageNumber,
    width: canvas.width,
    height: canvas.height,
    pngBytes: pngBuffer.length,
    sha256,
  };
}

async function renderPageSample(pdfDoc, pageNumber, scale) {
  let page;
  try {
    page = await pdfDoc.getPage(pageNumber);
  } catch (error) {
    throw createQaError('page_render_error', `Failed to load PDF page ${pageNumber}: ${getErrorMessage(error)}`);
  }

  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  try {
    await page.render({
      canvasContext: context,
      viewport,
    }).promise;
  } catch (error) {
    throw createQaError('page_render_error', `Failed to render PDF page ${pageNumber}: ${getErrorMessage(error)}`);
  }

  let imageData;
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    throw createQaError(
      'image_decode_error',
      `Failed to read pixel data for PDF page ${pageNumber}: ${getErrorMessage(error)}`
    );
  } finally {
    try {
      page.cleanup();
    } catch {
      // no-op
    }
  }

  const sample = sampleRgbNearest(imageData.data, canvas.width, canvas.height);

  return {
    page: pageNumber,
    width: canvas.width,
    height: canvas.height,
    whiteSpaceRatio: computeWhiteSpaceRatio(sample),
    sample,
  };
}

async function loadPdfDocument(pdfUrl) {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    url: pdfUrl,
    disableWorker: true,
    rangeChunkSize: 1 << 20,
    useWorkerFetch: true,
    isEvalSupported: false,
  });

  try {
    const pdfDoc = await loadingTask.promise;
    return { pdfDoc, loadingTask };
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // no-op
    }
    throw createQaError('pdf_download_failed', `Failed to load PDF from pdfUrl: ${getErrorMessage(error)}`);
  }
}

export async function probePdfFromUrl({
  pdfUrl,
  renderMode = DEFAULT_RENDER_MODE,
  maxRenderedPages = DEFAULT_MAX_RENDERED_PAGES,
  scale = DEFAULT_SCALE,
} = {}) {
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    throw createQaError('invalid_input', 'pdfUrl is required');
  }

  const normalizedRenderMode = normalizeRenderMode(renderMode);
  const normalizedMaxRenderedPages = normalizeMaxRenderedPages(maxRenderedPages);
  const normalizedScale = normalizeScale(scale);
  const startedAt = Date.now();

  const { pdfDoc, loadingTask } = await loadPdfDocument(pdfUrl);

  try {
    const pageCount = Number(pdfDoc?.numPages || 0);
    const pagesToRender = getPageNumbers(pageCount, normalizedRenderMode, normalizedMaxRenderedPages);
    const renderedPages = [];

    for (const pageNumber of pagesToRender) {
      renderedPages.push(await renderPageToPng(pdfDoc, pageNumber, normalizedScale));
    }

    try {
      await pdfDoc.cleanup();
    } catch {
      // no-op
    }

    return {
      success: true,
      pageCount,
      renderMode: normalizedRenderMode,
      renderedPages,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // no-op
    }
  }
}

export async function qaPdfFromUrl({
  pdfUrl,
  type = 'interior',
  expectedPageCount,
  previewImageUrls,
  pageLabels,
  scale = DEFAULT_SCALE,
} = {}) {
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    throw createQaError('invalid_input', 'pdfUrl is required');
  }

  const normalizedType = normalizeType(type);
  const normalizedExpectedPageCount = normalizeExpectedPageCount(expectedPageCount);
  const normalizedPreviewImageUrls = normalizePreviewImageUrls(previewImageUrls, normalizedExpectedPageCount);
  const normalizedPageLabels = normalizePageLabels(pageLabels, normalizedExpectedPageCount);
  const normalizedScale = normalizeScale(scale);
  const startedAt = Date.now();
  const warnings = [];

  const { pdfDoc, loadingTask } = await loadPdfDocument(pdfUrl);

  try {
    const pageCount = Number(pdfDoc?.numPages || 0);
    if (pageCount !== normalizedExpectedPageCount) {
      return {
        success: true,
        passed: false,
        type: normalizedType,
        reasonCode: 'page_count_mismatch',
        reason: `PDF page count mismatch (${pageCount} vs expected ${normalizedExpectedPageCount})`,
        pageCount,
        expectedPageCount: normalizedExpectedPageCount,
        failedPages: [],
        warnings,
        pageResults: [],
        durationMs: Date.now() - startedAt,
      };
    }

    const previewCache = new Map();
    const pageResults = [];
    const failedPages = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const previewUrl = normalizedPreviewImageUrls[pageNumber - 1];
      let preview = previewCache.get(previewUrl);
      if (!preview) {
        preview = await decodePreviewImageSample(previewUrl);
        previewCache.set(previewUrl, preview);
      }

      const rendered = await renderPageSample(pdfDoc, pageNumber, normalizedScale);
      const previewMeanAbsDiff = computeSampleMeanAbsDiff(rendered.sample, preview.sample);
      const previewTopHalfMeanAbsDiff = computeSampleMeanAbsDiff(
        rendered.sample,
        preview.sample,
        0,
        THUMBNAIL_SIZE / 2
      );
      const previewBottomHalfMeanAbsDiff = computeSampleMeanAbsDiff(
        rendered.sample,
        preview.sample,
        THUMBNAIL_SIZE / 2,
        THUMBNAIL_SIZE
      );

      const failReasons = [];
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

      const hasStrongPreviewMatch = previewMeanAbsDiff <= PREVIEW_STRONG_MATCH_THRESHOLD;
      if (!hasStrongPreviewMatch && rendered.whiteSpaceRatio !== null && rendered.whiteSpaceRatio > WHITE_SPACE_THRESHOLD) {
        failReasons.push(`white_space_ratio_too_high:${rendered.whiteSpaceRatio.toFixed(3)}>${WHITE_SPACE_THRESHOLD}`);
      }

      const passed = failReasons.length === 0;
      if (!passed) failedPages.push(pageNumber);

      pageResults.push({
        page: pageNumber,
        label: normalizedPageLabels[pageNumber - 1] || String(pageNumber),
        passed,
        whiteSpaceRatio: rendered.whiteSpaceRatio,
        previewMeanAbsDiff,
        previewTopHalfMeanAbsDiff,
        previewBottomHalfMeanAbsDiff,
        failReasons,
      });
    }

    const passed = failedPages.length === 0;
    return {
      success: true,
      passed,
      type: normalizedType,
      reasonCode: passed ? 'all_passed' : 'page_checks_failed',
      reason: passed ? 'all_passed' : `Failed pages: ${failedPages.join(', ')}`,
      pageCount,
      expectedPageCount: normalizedExpectedPageCount,
      failedPages,
      warnings,
      pageResults,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    try {
      await pdfDoc.cleanup();
    } catch {
      // no-op
    }
    try {
      await loadingTask.destroy();
    } catch {
      // no-op
    }
  }
}
