import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { assertW4GelatoPrintInput } from '@/lib/books/w4-gelato-print-input';
import { buildW4PrintInput } from '@/lib/books/w4-print-input';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayload(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return isRecord(value.payload) ? value.payload : value;
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = unwrapPayload(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });

  try {
    const result = await buildW4PrintInput(body, {
      loadManifest: downloadManifest,
      loadOrder: getOrderFromSupabase,
      defaultBackendUrl: request.nextUrl.origin,
      expectedProvider: 'gelato',
    });
    return NextResponse.json({ success: true, ...assertW4GelatoPrintInput(result) });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('[Internal W4 Gelato Build Print Input] Error:', error);
    return NextResponse.json({ error: 'Failed to build Gelato print input', details }, { status: 409 });
  }
}
