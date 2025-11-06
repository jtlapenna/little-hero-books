import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

           const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '3'));
           if (manifest && manifest.characterSpecs) {
             manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
           }

    // Note: DB updates to Supabase will be implemented in Phase 4

    return NextResponse.json({ success: true, orderId: payload.orderId, stage: '3', manifestLoaded: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}


