import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError, createNotFoundError } from '@/lib/error-handler';

/**
 * Queue order for 2B workflow (Background Removal) via router
 * POST /api/orders/[orderId]/trigger-background-removal
 * 
 * This endpoint queues the order for the router system instead of calling
 * the n8n webhook directly, ensuring we respect the 5-execution limit.
 */
async function triggerBackgroundRemoval(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  
  // Parse request body for optional force parameter
  let force = false;
  try {
    const body = await request.json().catch(() => ({}));
    force = !!body.force;
  } catch {
    // Body parsing failed, use default
  }
  
  console.log(`[POST /api/orders/[orderId]/trigger-background-removal] Queueing order ${orderId} for 2B workflow via router${force ? ' (force=true)' : ''}`);
  
  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  // Queue order for W2B via W1.1 router
  // IMPORTANT: Preserve review_stages when updating to avoid losing approvals
  const { updateOrderStatus } = await import('@/lib/status-service');
  const { getOrderFromSupabase } = await import('@/lib/supabase-client');
  
  try {
    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!currentOrder) {
      throw createNotFoundError(`Order ${orderId} not found`);
    }
    
    // Normalize review_stages so we preserve approvals and keep stages consistent
    // (Supabase may return JSONB as object, but be defensive if it's a string)
    let normalizedReviewStages: any = currentOrder.review_stages || {};
    if (typeof normalizedReviewStages === 'string') {
      try {
        normalizedReviewStages = JSON.parse(normalizedReviewStages);
      } catch {
        normalizedReviewStages = {};
      }
    }

    // Since this endpoint explicitly triggers 2B, treat preBria as approved so the order
    // does not appear to regress into the 2A review stage while queued for 2B.
    normalizedReviewStages = {
      ...(normalizedReviewStages || {}),
      preBria: {
        ...(normalizedReviewStages?.preBria || {}),
        status: 'approved',
      },
    };

    // If force=true, call webhook directly and mark as processing to prevent router from picking it up
    // If force=false, queue for router (don't call webhook directly)
    if (force) {
      const n8n2BWebhookUrl = process.env.N8N_2B_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal';
      try {
        await fetch(n8n2BWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId,
            characterHash: currentOrder.character_hash || undefined,
            force: true,
          }),
        });
        console.log(`[POST /api/orders/[orderId]/trigger-background-removal] ✅ Called n8n webhook directly with force=true`);
        
        // Mark as processing to prevent router from picking it up
        const updates: any = {
          next_workflow: '2B',
          execution_status: 'processing',
          current_workflow: '2B',
          started_at: new Date().toISOString(),
          queued_at: null, // Clear queued_at so router doesn't pick it up
        };
        
        updates.review_stages = normalizedReviewStages;
        
        await updateOrderStatus(orderId, updates);
      } catch (webhookError: any) {
        console.warn(`[POST /api/orders/[orderId]/trigger-background-removal] Failed to call n8n webhook directly, queueing for router:`, webhookError?.message);
        // Fallback: queue for router if direct call failed
        const updates: any = {
          next_workflow: '2B',
          execution_status: 'ready_for_processing',
          queued_at: new Date().toISOString(),
          started_at: null,
          current_workflow: null
        };
        
        updates.review_stages = normalizedReviewStages;
        
        await updateOrderStatus(orderId, updates);
      }
    } else {
      // Normal flow: queue for router (don't call webhook directly)
      const updates: any = {
        next_workflow: '2B',
        execution_status: 'ready_for_processing',
        queued_at: new Date().toISOString(),
        started_at: null,
        current_workflow: null
      };
      
      updates.review_stages = normalizedReviewStages;
      
      await updateOrderStatus(orderId, updates);
    }
    
    console.log(`[POST /api/orders/[orderId]/trigger-background-removal] ✅ Queued order ${orderId} for W2B via router`);
    
    return NextResponse.json({
      success: true,
      message: force 
        ? 'Order queued for background removal workflow with force=true. Router will process it when capacity is available.'
        : 'Order queued for background removal workflow. Router will process it when capacity is available.',
      orderId,
      next_workflow: '2B',
      execution_status: 'ready_for_processing',
      force
    });
  } catch (error: any) {
    console.error(`[POST /api/orders/[orderId]/trigger-background-removal] Error queueing order:`, error);
    // If it's already a NextResponse (e.g., from createNotFoundError), re-throw it
    if (error instanceof NextResponse) {
      throw error;
    }
    throw new Error(`Failed to queue order for background removal workflow: ${error?.message || error}`);
  }
}

export const POST = withErrorHandling(triggerBackgroundRemoval);

