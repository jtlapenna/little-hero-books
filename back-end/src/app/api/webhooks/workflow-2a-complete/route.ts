import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)),
  characterHash: z.string().min(1).optional(),
  amazonOrderId: z.string().optional(),
  posesGenerated: z.number().int().optional(),
  needsReview: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    // Try to download/parse manifest (preferred)
    try {
            const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '2a'));
            if (manifest && manifest.characterSpecs) {
              manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
            }
      return NextResponse.json({ success: true, orderId: payload.orderId, stage: '2a', manifestLoaded: true });
    } catch {
      // Fallback: sanity-check object exists without reading body (edge/runtime-safe)
      const key = `book-mvp-simple-adventure/orders/${payload.orderId}/manifests/2a-manifest.json`;
      const resp = await getObject(R2_ORDERS_BUCKET, key);
      // Check if response is OK (object exists)
      if (resp.ok) {
        return NextResponse.json({ success: true, orderId: payload.orderId, stage: '2a', manifestLoaded: false, objectExists: true });
      } else {
        throw new Error(`Object not found: ${key}`);
      }
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}


