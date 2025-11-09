import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';
import { resetOrderToInitialState, OrderResetError } from '@/lib/order-reset';

async function resetOrder(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_ORDER_RESET !== 'true'
  ) {
    return NextResponse.json(
      {
        error:
          'Order reset is disabled in production. Set ENABLE_ORDER_RESET=true to allow this endpoint.',
      },
      { status: 403 }
    );
  }

  const { orderId } = await params;

  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  try {
    const order = await resetOrderToInitialState(orderId);
    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    if (error instanceof OrderResetError) {
      if (error.message === 'ORDER_NOT_FOUND') {
        throw createNotFoundError(`Order ${orderId} not found`);
      }

      console.error('[OrderReset] Unexpected reset error', {
        orderId,
        error: error.message,
      });

      return NextResponse.json(
        { error: 'Failed to reset order. See logs for details.' },
        { status: 500 }
      );
    }

    throw error;
  }
}

export const POST = withErrorHandling(resetOrder);


