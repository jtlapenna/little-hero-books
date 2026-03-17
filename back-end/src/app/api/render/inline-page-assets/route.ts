import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { getObject } from '@/lib/r2-client';
import { getBucketFromKey } from '@/lib/r2-utils';

const MAX_HTML_LENGTH = 5_000_000; // ~5MB
const MAX_ASSET_KEYS = 50;

/**
 * Fetch from R2 and protect against truncated reads (same failure mode as /api/assets).
 */
async function getObjectBufferWithRetry(
  bucket: string,
  key: string,
  attempts = 3
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const r2Response = await getObject(bucket, key);
      const contentType =
        r2Response.headers.get('content-type') || getContentTypeFromKey(key);
      const expectedLenRaw = r2Response.headers.get('content-length');
      const expectedLen = expectedLenRaw ? Number(expectedLenRaw) : undefined;

      const buffer = await r2Response.arrayBuffer();
      const actualLen = buffer.byteLength;

      // If R2 gave us a length and the download is shorter, retry.
      if (Number.isFinite(expectedLen) && expectedLen !== actualLen) {
        lastError = new Error(
          `Truncated R2 object: expected ${expectedLen} bytes, got ${actualLen} bytes`
        );
        console.warn(
          `[inline-page-assets] ${String(lastError)} (attempt ${i + 1}/${attempts}) key=${key}`
        );
        continue;
      }

      return { buffer, contentType };
    } catch (err) {
      lastError = err;
      console.warn(
        `[inline-page-assets] R2 fetch/read failed (attempt ${i + 1}/${attempts}) key=${key}:`,
        (err as Error)?.message || err
      );
    }
  }

  throw lastError || new Error('Failed to fetch object from R2');
}

function getContentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * POST /api/render/inline-page-assets
 *
 * Accepts HTML that contains /api/assets/... URLs and returns the same HTML
 * with those URLs replaced by data:image/...;base64,... so that renderers
 * (e.g. PDFMonkey) don't need to fetch external images and won't capture
 * before images load (avoiding half-rendered PNGs).
 *
 * Body: { html: string }
 * Response: { html: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const html = typeof body.html === 'string' ? body.html : '';

    if (!html || html.length > MAX_HTML_LENGTH) {
      return NextResponse.json(
        { error: 'Missing or oversized html (max 5MB)' },
        { status: 400 }
      );
    }

    // Extract all asset keys from html (src=".../api/assets/KEY", url('.../api/assets/KEY'), etc.)
    // Note: exclude `)` so css url(/api/assets/key.png) doesn't capture trailing ')'.
    const keyMatches = html.matchAll(/\/api\/assets\/([^"'?&\s)>\]]+)/g);
    const keysSet = new Set<string>();
    for (const m of keyMatches) {
      const key = m[1].split('?')[0].trim();
      if (key) keysSet.add(key);
    }
    const keys = Array.from(keysSet);

    if (keys.length > MAX_ASSET_KEYS) {
      return NextResponse.json(
        { error: `Too many asset keys (${keys.length}, max ${MAX_ASSET_KEYS})` },
        { status: 400 }
      );
    }

    const keyToDataUrl = new Map<string, string>();

    for (const key of keys) {
      const bucket = getBucketFromKey(key);
      try {
        const { buffer, contentType } = await getObjectBufferWithRetry(bucket, key, 3);
        const base64 = Buffer.from(buffer).toString('base64');
        keyToDataUrl.set(key, `data:${contentType};base64,${base64}`);
      } catch (err) {
        console.warn(`[inline-page-assets] Failed to fetch ${key}:`, (err as Error)?.message);
        // Leave URL as-is so the page still renders (image may fail in renderer)
      }
    }

    let out = html;
    for (const key of keys) {
      const dataUrl = keyToDataUrl.get(key);
      if (!dataUrl) continue;
      const escaped = escapeRegex(key);
      const urlPattern = new RegExp(
        // Replace both absolute and relative URLs.
        `((?:https?:\\/\\/[^"'\\s)]*?)?\\/api\\/assets\\/${escaped})(?:[?][^"'\\s)]*)?`,
        'g'
      );
      out = out.replace(urlPattern, () => dataUrl);
    }

    return NextResponse.json({ html: out });
  } catch (error) {
    console.error('[inline-page-assets] Error:', error);
    return NextResponse.json(
      { error: (error as Error)?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
