import { NextRequest, NextResponse } from 'next/server';
import { extractBookIdFromPathLike } from '@/lib/order-paths';
import { extractR2Key } from '@/lib/r2-utils';
import { normalizePoseScaleAsset } from '@/lib/pose-scale-normalization';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, poseNumber, characterHash, bookId, mode } = body as {
      imageUrl?: unknown;
      poseNumber?: unknown;
      characterHash?: unknown;
      bookId?: unknown;
      mode?: unknown;
    };

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing imageUrl' });
    }
    if (typeof poseNumber !== 'number' || poseNumber < 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing or invalid poseNumber',
      });
    }

    const imageKey = extractR2Key(imageUrl);
    if (!imageKey) {
      return NextResponse.json({
        success: false,
        error: `Cannot extract R2 key from imageUrl: ${imageUrl}`,
      });
    }

    const result = await normalizePoseScaleAsset({
      imageKey,
      poseNumber,
      characterHash: typeof characterHash === 'string' ? characterHash : null,
      bookId:
        (typeof bookId === 'string' && bookId.trim()) ||
        extractBookIdFromPathLike(imageKey),
      mode: mode === 'strict' ? 'strict' : 'default',
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[NormScale] Unexpected error:', error);
    return NextResponse.json({ success: false, error: message });
  }
}
