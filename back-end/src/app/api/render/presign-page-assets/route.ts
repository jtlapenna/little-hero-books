import { NextRequest, NextResponse } from 'next/server';

import { verifyBearerAuth } from '@/lib/auth';
import { getSignedUrlForObject } from '@/lib/r2-service';
import { getBucketFromKey } from '@/lib/r2-utils';

const MAX_HTML_LENGTH = 5_000_000; // ~5MB
const MAX_ASSET_KEYS = 80;
const DEFAULT_EXPIRES_IN_SECONDS = 6 * 60 * 60; // 6 hours

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAssetKeysFromHtml(html: string): string[] {
  // Purpose: extract <key> from any occurrence of /api/assets/<key>
  // without regex footguns (html can contain quotes, CSS url(), etc.).
  const prefix = '/api/assets/';
  const keys = new Set<string>();

  for (let i = 0; i < html.length; ) {
    const idx = html.indexOf(prefix, i);
    if (idx === -1) break;

    let j = idx + prefix.length;
    let key = '';

    for (; j < html.length; j++) {
      const ch = html[j];

      // Stop on URL/query delimiters and common HTML/CSS terminators
      if (
        ch === '"' ||
        ch === "'" ||
        ch === '?' ||
        ch === '&' ||
        ch === ')' ||
        ch === '>' ||
        ch === ']' ||
        /\s/.test(ch)
      ) {
        break;
      }

      key += ch;
    }

    const cleaned = key.trim();
    if (cleaned) keys.add(cleaned);

    i = j;
  }

  return Array.from(keys);
}

/**
 * POST /api/render/presign-page-assets
 *
 * Purpose: Rewrite HTML containing `/api/assets/<key>` URLs into HTML containing
 * direct, signed R2 GET URLs so renderers (e.g. PDFMonkey) fetch assets directly
 * (avoids the admin proxy path and reduces partial-render failures).
 *
 * Body: { html: string, expiresInSeconds?: number }
 * Response: { html: string }
 */
export async function POST(request: NextRequest) {
  // Auth is optional.
  // Purpose: allow local/dev testing without env setup; lock down in prod by setting BACKEND_API_TOKEN.
  if (process.env.BACKEND_API_TOKEN) {
    const auth = verifyBearerAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // ---- Input validation ----
    const body = (await request.json().catch(() => ({}))) as unknown;
    const html =
      isRecord(body) && typeof body.html === 'string'
        ? body.html
        : '';

    if (!html || html.length > MAX_HTML_LENGTH) {
      return NextResponse.json(
        { error: 'Missing or oversized html (max 5MB)' },
        { status: 400 }
      );
    }

    const expiresInSecondsRaw =
      isRecord(body) && body.expiresInSeconds !== undefined
        ? Number(body.expiresInSeconds)
        : DEFAULT_EXPIRES_IN_SECONDS;

    const expiresInSeconds = Number.isFinite(expiresInSecondsRaw)
      ? Math.floor(expiresInSecondsRaw)
      : DEFAULT_EXPIRES_IN_SECONDS;

    if (expiresInSeconds < 60 || expiresInSeconds > 604_800) {
      return NextResponse.json(
        { error: 'expiresInSeconds must be between 60 and 604800 seconds (1 week)' },
        { status: 400 }
      );
    }

    // ---- Extract keys ----
    const keys = extractAssetKeysFromHtml(html);

    if (keys.length > MAX_ASSET_KEYS) {
      return NextResponse.json(
        { error: `Too many asset keys (${keys.length}, max ${MAX_ASSET_KEYS})` },
        { status: 400 }
      );
    }

    // ---- Presign and rewrite ----
    const keyToSignedUrl = new Map<string, string>();

    for (const key of keys) {
      const bucket = getBucketFromKey(key);
      const signedUrl = await getSignedUrlForObject(key, bucket, expiresInSeconds);
      keyToSignedUrl.set(key, signedUrl);
    }

    let out = html;

    for (const key of keys) {
      const signedUrl = keyToSignedUrl.get(key);
      if (!signedUrl) continue;

      const escaped = escapeRegex(key);
      const urlPattern = new RegExp(
        `((?:https?:\\/\\/[^"'\\s)]*?)?\\/api\\/assets\\/${escaped})(?:[?][^"'\\s)]*)?`,
        'g'
      );

      out = out.replace(urlPattern, () => signedUrl);
    }

    return NextResponse.json({ html: out });
  } catch (error) {
    console.error('[presign-page-assets] Error:', error);
    return NextResponse.json(
      { error: (error as Error)?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
