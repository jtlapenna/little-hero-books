/**
 * Preview cache check endpoint.
 * GET /api/preview/check?hash={hash} - check by hash directly
 * POST /api/preview/check - check by character_specs (computes hash server-side)
 * Response: { exists: boolean, imageUrl?: string, hash: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { headObject, R2_PUBLIC_BUCKET, R2_CHARACTERS_PREFIX } from '@/lib/r2-client';
import { calculatePreviewHash } from '@/lib/character-hash';

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Check cache by hash (HEAD request to R2). */
async function checkCacheByHash(hash: string): Promise<{ exists: boolean; imageUrl?: string }> {
  const previewKey = `${R2_CHARACTERS_PREFIX}${hash}/preview.png`;
  const response = await headObject(R2_PUBLIC_BUCKET, previewKey);
  
  if (response.ok) {
    return { exists: true, imageUrl: `/api/assets/${previewKey}` };
  }
  return { exists: false };
}

/** GET: check by hash query param. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');

    if (!hash || !/^[a-f0-9]{16}$/i.test(hash)) {
      return NextResponse.json(
        { error: 'Invalid or missing hash parameter (expected 16 hex chars)', exists: false },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await checkCacheByHash(hash);
    return NextResponse.json({ ...result, hash }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error('[Preview Check GET] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cache check failed', exists: false },
      { status: 500, headers: corsHeaders }
    );
  }
}

/** POST: check by character_specs (computes hash server-side for consistency). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const specs = body.character_specs ?? body.characterSpecs ?? {};

    if (!specs || typeof specs !== 'object' || Object.keys(specs).length === 0) {
      return NextResponse.json(
        { error: 'Missing character_specs', exists: false },
        { status: 400, headers: corsHeaders }
      );
    }

    // Compute hash server-side (ensures algorithm consistency)
    const hash = calculatePreviewHash(specs as Record<string, unknown>);
    
    // First check the D2C preview cache (preview_hash location)
    const previewResult = await checkCacheByHash(hash);
    if (previewResult.exists) {
      return NextResponse.json({ ...previewResult, hash, source: 'preview' }, { headers: corsHeaders });
    }
    return NextResponse.json({ exists: false, hash }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error('[Preview Check POST] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cache check failed', exists: false },
      { status: 500, headers: corsHeaders }
    );
  }
}
