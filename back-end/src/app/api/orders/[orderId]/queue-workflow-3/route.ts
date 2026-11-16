import { NextRequest, NextResponse } from 'next/server';
import { findExactPreviewOrder } from '@/lib/customer-preview-access';
import { queueReviewedBookAssembly } from '@/lib/book-assembly-queue';
import { BookReviewConflict } from '@/lib/book-review-invalidation';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const row = await findExactPreviewOrder(orderId);
    if (!row) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const result = await queueReviewedBookAssembly(row);
    return NextResponse.json({ success: true, orderId, ...result, message: result.alreadyComplete ? 'Book assembly is already complete.' : 'Book assembly is queued for the workflow router.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BookReviewConflict ? error.message : 'Could not queue book assembly' }, { status: error instanceof BookReviewConflict ? 409 : 500 });
  }
}
