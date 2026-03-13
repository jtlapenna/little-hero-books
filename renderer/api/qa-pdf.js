import { probePdfFromUrl, qaPdfFromUrl } from '../src/qa-pdf.js';

function isAuthorized(req) {
  const expected = (process.env.RENDERER_INTERNAL_TOKEN || '').trim();
  if (!expected) return true;
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') && auth.slice(7) === expected;
}

export const config = {
  maxDuration: 300,
};

function getErrorCode(error) {
  return error && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : 'internal_error';
}

function getStatusCodeForError(error) {
  const code = getErrorCode(error);
  if (code === 'invalid_input') return 400;
  return 500;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const body = req.body || {};
  const {
    pdfUrl,
    renderMode = 'first_last',
    maxRenderedPages = 2,
    scale = 1,
    orderId = null,
    type = 'interior',
    expectedPageCount,
    previewImageUrls,
    pageLabels,
  } = body;

  if (typeof pdfUrl !== 'string' || !pdfUrl.trim()) {
    res.status(400).json({ success: false, error: 'pdfUrl is required' });
    return;
  }

  const isQaMode = Object.prototype.hasOwnProperty.call(body, 'previewImageUrls');

  try {
    if (isQaMode) {
      const result = await qaPdfFromUrl({
        pdfUrl: pdfUrl.trim(),
        type,
        expectedPageCount,
        previewImageUrls,
        pageLabels,
        scale,
      });

      res.status(200).json({
        success: true,
        orderId,
        pdfUrl: '[redacted]',
        ...result,
      });
      return;
    }

    const result = await probePdfFromUrl({
      pdfUrl: pdfUrl.trim(),
      renderMode,
      maxRenderedPages,
      scale,
    });

    res.status(200).json({
      success: true,
      orderId,
      pdfUrl: '[redacted]',
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(getStatusCodeForError(error)).json({
      success: false,
      orderId,
      reasonCode: getErrorCode(error),
      error: message || 'qa-pdf failed',
    });
  }
}
