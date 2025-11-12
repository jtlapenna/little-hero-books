import { NextRequest, NextResponse } from 'next/server';
import { updateOrderStatus } from '@/lib/status-service';

/**
 * Queue an order for workflow 3 (Book Assembly) via W1.1 router
 * POST /api/orders/[orderId]/queue-workflow-3
 * 
 * This updates Supabase to mark the order as ready for workflow 3.
 * W1.1 router will pick it up on its next cycle (every 30 seconds).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    
    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Update order status to queue for workflow 3
    // This matches what approveStage does when postBria is approved
    await updateOrderStatus(orderId, {
      execution_status: 'ready_for_processing',
      next_workflow: '3',
      queued_at: nowIso,
      started_at: null, // Clear any previous processing state
      current_workflow: null,
    });

    return NextResponse.json({ 
      success: true, 
      orderId,
      message: 'Order queued for workflow 3. W1.1 router will process it within 30 seconds.',
      queuedAt: nowIso
    });
  } catch (err: any) {
    console.error('[queue-workflow-3] Error:', err);
    return NextResponse.json({ 
      error: err?.message || 'Internal error' 
    }, { status: 500 });
  }
}

