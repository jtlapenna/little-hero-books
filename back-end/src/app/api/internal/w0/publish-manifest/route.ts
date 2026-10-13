import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { parseW0ManifestRequest } from '@/lib/w0-manifest-request';
import { buildOrderIntakeManifestFromNormalizedInputRuntime } from '@/lib/w0-manifest-builder';
import { prepareFrozenW0Manifest } from '@/lib/books/freeze-w0-manifest';
import { w0ManifestStorage } from '@/lib/books/w0-manifest-storage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = parseW0ManifestRequest(await request.json());
    const candidate = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
    const result = await prepareFrozenW0Manifest(parsed.input, candidate, w0ManifestStorage, true);
    return NextResponse.json({ success: true, ...result, orderId: result.orderUpsert.orderId, r2Key: result.manifestKey });
  } catch {
    return NextResponse.json({ error: 'W0 manifest publication or persistence was not confirmed' }, { status: 409 });
  }
}
