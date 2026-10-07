import { readOrderPoseContext } from '@/lib/books/order-pose-context';
import { loadBundledBookConfig } from '@/lib/books/load-book-config';
import { buildOrderPrefix } from '@/lib/order-paths';
import { NextRequest, NextResponse } from 'next/server';
import { extractBookIdFromPathLike } from '@/lib/order-paths';
import { extractR2Key } from '@/lib/r2-utils';
import { normalizePoseScaleAsset } from '@/lib/pose-scale-normalization';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, poseNumber, characterHash, bookId, mode, orderId } = body as {
      orderId?: unknown;
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

    const resolvedBookId = (typeof bookId === 'string' && bookId.trim()) || extractBookIdFromPathLike(imageKey);
    let referenceKey: string | undefined;
    if (typeof orderId === 'string' && resolvedBookId) {
      const context = await readOrderPoseContext({ bookId: resolvedBookId, orderPrefix: buildOrderPrefix(orderId, resolvedBookId) });
      if (!context.allowed.includes(poseNumber)) throw new Error('Pose is not part of this order');
      referenceKey = context.referenceKeys[String(poseNumber)];
    } else if (resolvedBookId) {
      let legacy = false;
      try { legacy = !loadBundledBookConfig({ bookId: resolvedBookId }).rendering.recipe; } catch { /* Unknown recipe needs order provenance. */ }
      if (!legacy) throw new Error('Configured pose normalization requires orderId');
    }
    const result = await normalizePoseScaleAsset({
      referenceKey,
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
