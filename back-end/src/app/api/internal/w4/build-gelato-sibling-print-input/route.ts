import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { buildW4SiblingPrintInput } from '@/lib/books/w4-sibling-print-input';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayload(value: unknown): JsonRecord | unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.payload)) return value.payload;
  return isRecord(value.payload) ? value.payload : value;
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = unwrapPayload(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'Request body must be a JSON object or array' }, { status: 400 });

  try {
    const result = await buildW4SiblingPrintInput(body, {
      loadManifest: downloadManifest,
      loadOrder: getOrderFromSupabase,
      defaultBackendUrl: request.nextUrl.origin,
      expectedProvider: 'gelato',
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('[Internal W4 Gelato Sibling Build Print Input] Error:', error);
    return NextResponse.json({ error: 'Failed to build Gelato sibling print input', details }, { status: 409 });
  }
}
