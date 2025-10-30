import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '@/lib/r2-config';

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
            const manifest: any = await downloadManifest(payload.orderId, '2a');
            if (manifest && manifest.characterSpecs) {
              manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
            }
      return NextResponse.json({ success: true, orderId: payload.orderId, stage: '2a', manifestLoaded: true });
    } catch {
      // Fallback: sanity-check object exists without reading body (edge/runtime-safe)
      const ORDERS_BUCKET = process.env.R2_ORDERS_BUCKET_NAME || 'little-hero-orders';
      const key = `book-mvp-simple-adventure/orders/${payload.orderId}/manifests/2a-manifest.json`;
      await r2Client.send(new GetObjectCommand({ Bucket: ORDERS_BUCKET, Key: key }));
      return NextResponse.json({ success: true, orderId: payload.orderId, stage: '2a', manifestLoaded: false, objectExists: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}


