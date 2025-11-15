import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError, createNotFoundError } from '@/lib/error-handler';

/**
 * Queue order for 3 workflow (Book Assembly) via router
 * POST /api/orders/[orderId]/trigger-book-assembly
 * 
 * This endpoint queues the order for the router system instead of calling
 * the n8n webhook directly, ensuring we respect the 5-execution limit.
 */
async function triggerBookAssembly(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  
  console.log(`[POST /api/orders/[orderId]/trigger-book-assembly] Queueing order ${orderId} for 3 workflow via router`);
  
  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  // Queue order for W3 via W1.1 router
  // IMPORTANT: Preserve review_stages when updating to avoid losing approvals
  const { updateOrderStatus } = await import('@/lib/status-service');
  const { getOrderFromSupabase } = await import('@/lib/supabase-client');
  
  try {
    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!currentOrder) {
      throw createNotFoundError(`Order ${orderId} not found`);
    }
    
    const updates: any = {
      next_workflow: '3',
      execution_status: 'ready_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null
    };
    
    // Preserve review_stages if they exist (to maintain approvals)
    if (currentOrder.review_stages) {
      updates.review_stages = currentOrder.review_stages;
    }
    
    await updateOrderStatus(orderId, updates);
    console.log(`[POST /api/orders/[orderId]/trigger-book-assembly] ✅ Queued order ${orderId} for W3 via router`);
    
    return NextResponse.json({
      success: true,
      message: 'Order queued for book assembly workflow. Router will process it when capacity is available.',
      orderId,
      next_workflow: '3',
      execution_status: 'ready_for_processing'
    });
  } catch (error: any) {
    console.error(`[POST /api/orders/[orderId]/trigger-book-assembly] Error queueing order:`, error);
    // If it's already a NextResponse (e.g., from createNotFoundError), re-throw it
    if (error instanceof NextResponse) {
      throw error;
    }
    throw new Error(`Failed to queue order for book assembly workflow: ${error?.message || error}`);
  }
}

export const POST = withErrorHandling(triggerBookAssembly);


