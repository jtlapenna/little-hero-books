import crypto from 'node:crypto';

import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

const DEFAULT_MAX_RENDERED_PAGES = 2;
const DEFAULT_SCALE = 1;
const DEFAULT_RENDER_MODE = 'first_last';

let pdfjsPromise = null;

function installPdfRenderGlobals() {
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2D;
}

async function getPdfJs() {
  if (!pdfjsPromise) {
    installPdfRenderGlobals();
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

function normalizeRenderMode(value) {
  return value === 'all' ? 'all' : DEFAULT_RENDER_MODE;
}

function normalizeMaxRenderedPages(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_RENDERED_PAGES;
  return Math.min(Math.floor(parsed), 100);
}

function getPageNumbers(pageCount, renderMode, maxRenderedPages) {
  if (pageCount < 1) return [];
  if (renderMode === 'all') {
    return Array.from({ length: Math.min(pageCount, maxRenderedPages) }, (_, index) => index + 1);
  }
  if (pageCount === 1) return [1];
  return [1, pageCount];
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

export async function probePdfFromUrl({
  pdfUrl,
  renderMode = DEFAULT_RENDER_MODE,
  maxRenderedPages = DEFAULT_MAX_RENDERED_PAGES,
  scale = DEFAULT_SCALE,
} = {}) {
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    throw new Error('pdfUrl is required');
  }

  const normalizedRenderMode = normalizeRenderMode(renderMode);
  const normalizedMaxRenderedPages = normalizeMaxRenderedPages(maxRenderedPages);
  const startedAt = Date.now();
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
    const pageCount = Number(pdfDoc?.numPages || 0);
    const pagesToRender = getPageNumbers(pageCount, normalizedRenderMode, normalizedMaxRenderedPages);
    const renderedPages = [];

    for (const pageNumber of pagesToRender) {
      renderedPages.push(await renderPageToPng(pdfDoc, pageNumber, scale));
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
