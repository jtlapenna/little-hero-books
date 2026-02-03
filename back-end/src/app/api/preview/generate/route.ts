/**
 * POST /api/preview/generate
 * Generate character preview image from character_specs (Gemini + R2).
 * Request: { character_specs: CreateFlowCharacter }
 * Response: { imageUrl: string } or { error: string }
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { resolvePreviewCanonicals, type CharacterSpecsInput } from '@/lib/preview-canonicals';
import { buildPreviewGeminiRequest } from '@/lib/preview-gemini';

// CORS: allow D2C frontend (e.g. localhost:4321) to call this API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const GEMINI_MODEL = 'gemini-3-pro-image-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PREVIEW_KEY_PREFIX = 'previews/';

function requireString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Extract inline image from Gemini response (same shape as regenerate-pose).
 */
function extractImageFromGeminiResponse(geminiData: Record<string, unknown>): { base64: string; mimeType: string } | null {
  const candidates = (geminiData.candidates as Array<Record<string, unknown>>) ?? [];
  if (candidates.length === 0) return null;
  const parts = (candidates[0].content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline = (p.inlineData as Record<string, unknown>) ?? (p.inline_data as Record<string, unknown>);
    if (inline?.data && typeof inline.data === 'string') {
      const mime = (inline.mimeType as string) ?? (inline.mime_type as string) ?? 'image/png';
      return { base64: inline.data as string, mimeType: mime };
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const character_specs = body.character_specs ?? body.characterSpecs ?? {};
    const specs = character_specs as CharacterSpecsInput;

    // Validate required fields for generation
    const skinTone = requireString(specs, 'skinTone') ?? 'medium';
    const hairStyle = requireString(specs, 'hairStyle') ?? 'side-part';
    const hairColor = requireString(specs, 'hairColor') ?? '';
    const favoriteColor = requireString(specs, 'favoriteColor') ?? 'blue';

    if (!specs || typeof specs !== 'object') {
      return NextResponse.json({ error: 'Missing character_specs' }, { status: 400, headers: corsHeaders });
    }

    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500, headers: corsHeaders });
    }

    // Resolve canonicals and asset keys
    const resolved = resolvePreviewCanonicals(specs);

    // Load base image from R2
    let baseRes: Response;
    try {
      baseRes = await getObject(R2_PUBLIC_BUCKET, resolved.baseRefKey);
    } catch (e: unknown) {
      console.error('[Preview Generate] Failed to load base image:', resolved.baseRefKey, e);
      return NextResponse.json(
        { error: 'Base character image not available' },
        { status: 502, headers: corsHeaders }
      );
    }
    const baseBuf = await baseRes.arrayBuffer();
    const baseMime = baseRes.headers.get('content-type') || 'image/png';
    const base64Base = Buffer.from(baseBuf).toString('base64');

    // Load hair reference: R2 first; fallback to local dir if PREVIEW_HAIR_FALLBACK_DIR set (dev)
    let hairBuf: ArrayBuffer;
    let hairMime = 'image/png';
    try {
      const hairRes = await getObject(R2_PUBLIC_BUCKET, resolved.hairRefKey);
      hairBuf = await hairRes.arrayBuffer();
      hairMime = hairRes.headers.get('content-type') || 'image/png';
    } catch (e: unknown) {
      const fallbackDir = process.env.PREVIEW_HAIR_FALLBACK_DIR;
      if (fallbackDir) {
        const hairFilename = path.basename(resolved.hairRefKey);
        const localPath = path.join(fallbackDir, hairFilename);
        try {
          const buf = await readFile(localPath);
          hairBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } catch (fallbackErr) {
          console.error('[Preview Generate] Hair ref R2 and fallback failed:', resolved.hairRefKey, localPath, e, fallbackErr);
          return NextResponse.json(
            { error: `Hairstyle reference not available. Expected R2 key: ${resolved.hairRefKey} or file: ${localPath}` },
            { status: 502, headers: corsHeaders }
          );
        }
      } else {
        const r2Message = e instanceof Error ? e.message : String(e);
        console.error('[Preview Generate] Failed to load hair ref:', resolved.hairRefKey, 'bucket:', R2_PUBLIC_BUCKET, e);
        return NextResponse.json(
          { error: `Hairstyle reference not available. Key: ${resolved.hairRefKey}, bucket: ${R2_PUBLIC_BUCKET}. R2: ${r2Message}` },
          { status: 502, headers: corsHeaders }
        );
      }
    }
    const base64Hair = Buffer.from(hairBuf).toString('base64');

    // Build Gemini request
    const requestBody = buildPreviewGeminiRequest({
      resolved,
      base64Base,
      baseMime,
      base64Hair,
      hairMime,
    });

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('[Preview Generate] Gemini error:', geminiResponse.status, errText);
      return NextResponse.json(
        { error: 'Character preview generation failed', details: errText.slice(0, 200) },
        { status: geminiResponse.status >= 500 ? 502 : 400, headers: corsHeaders }
      );
    }

    const geminiData = (await geminiResponse.json()) as Record<string, unknown>;
    const imageData = extractImageFromGeminiResponse(geminiData);
    if (!imageData) {
      return NextResponse.json(
        { error: 'No image in preview response' },
        { status: 500, headers: corsHeaders }
      );
    }

    const imageBuffer = Buffer.from(imageData.base64, 'base64');
    const previewId = crypto.randomUUID();
    const r2Key = `${PREVIEW_KEY_PREFIX}${previewId}.png`;

    await putObject(R2_PUBLIC_BUCKET, r2Key, imageBuffer, 'image/png');

    // Return URL via backend proxy (same-origin /api/assets/...)
    const imageUrl = `/api/assets/${r2Key}`;

    return NextResponse.json({ imageUrl }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error('[Preview Generate] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview generation failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}
