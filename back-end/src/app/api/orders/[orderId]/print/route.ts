import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';

async function sendToPrint(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Invalid order ID provided' },
      { status: 400 }
    );
  }

  let payload: Record<string, unknown> = {};
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      payload = await request.json();
    } catch (error) {
      console.warn('[Workflow4] Failed to parse JSON payload for print trigger', {
        orderId,
        error
      });
    }
  }

  const source =
    typeof payload?.source === 'string' ? String(payload.source) : 'unspecified';

  console.info('[Workflow4] Placeholder print workflow triggered', {
    orderId,
    source,
    payload
  });

  return NextResponse.json({
    success: true,
    message: 'Book Successfully Sent to Print Service'
  });
}

export const POST = withErrorHandling(sendToPrint);

