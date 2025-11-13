import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';

/**
 * Trigger 2B workflow (Background Removal) for an order
 * POST /api/orders/[orderId]/trigger-background-removal
 */
async function triggerBackgroundRemoval(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const context = getRequestContext(request);
  
  console.log(`[POST /api/orders/[orderId]/trigger-background-removal] Triggering 2B workflow for order: ${orderId}`);
  
  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  // Load the 2a manifest to get order details and construct manifest URL
  let manifest: any = null;
  try {
    const manifestKey = buildManifestKey(orderId, '2a');
    manifest = await downloadManifest(manifestKey);
    console.log(`[POST /api/orders/[orderId]/trigger-background-removal] Loaded 2a manifest for order ${orderId}`);
  } catch (error: any) {
    console.error(`[POST /api/orders/[orderId]/trigger-background-removal] Failed to load manifest:`, error);
    throw createNotFoundError(`2a manifest not found for order ${orderId}`);
  }

  // Construct manifest URL using our API proxy endpoint
  // This avoids needing public R2 bucket access for the orders bucket
  const manifestKey = buildManifestKey(orderId, '2a');
  
  // Use our API endpoint to serve the manifest (works with private buckets)
  // Get the base URL from the request
  const baseUrl = request.headers.get('origin') || 
    process.env.BACKEND_URL || 
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    'https://admin.littleherolabs.com';
  
  const manifestUrl = `${baseUrl}/api/manifests/${manifestKey}`;

  // Get webhook callback URL
  const webhookUrl = process.env.BACKEND_WEBHOOK_2B_COMPLETE_URL 
    || `${process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || ''}/api/webhooks/workflow-2b-complete`;

  // Build payload for n8n webhook
  // n8n expects: {{ $json.body.manifestUrl || $json.manifestUrl }}
  // So we can send it at the top level
  const payload = {
    manifestUrl,
    webhookUrl,
    orderId,
    characterHash: manifest.characterHash,
    trigger: 'manual_background_removal',
    // Also include in body for compatibility
    body: {
      manifestUrl,
      webhookUrl,
      orderId,
      characterHash: manifest.characterHash
    }
  };

  // CRITICAL: Queue order for W2B via W1.1 router before calling webhook
  // This ensures the order is properly queued and won't be auto-processed by router
  const { updateOrderStatus } = await import('@/lib/status-service');
  try {
    await updateOrderStatus(orderId, {
      next_workflow: '2B',
      execution_status: 'ready_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null
    });
    console.log(`[POST /api/orders/[orderId]/trigger-background-removal] ✅ Queued order for W2B via W1.1 router`);
  } catch (statusError: any) {
    console.warn(`[POST /api/orders/[orderId]/trigger-background-removal] ⚠️ Failed to queue order (continuing anyway):`, statusError);
    // Continue with webhook call even if status update fails
  }

  console.log(`[POST /api/orders/[orderId]/trigger-background-removal] Calling n8n webhook with payload:`, {
    manifestUrl,
    webhookUrl,
    orderId,
    characterHash: manifest.characterHash
  });

  // Call n8n webhook
  const n8nWebhookUrl = process.env.N8N_2B_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal';
  
  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[POST /api/orders/[orderId]/trigger-background-removal] n8n webhook error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Failed to trigger 2B workflow: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json().catch(() => ({}));
    console.log(`[POST /api/orders/[orderId]/trigger-background-removal] ✅ Successfully triggered 2B workflow`);

    return NextResponse.json({
      success: true,
      message: 'Background removal workflow triggered successfully',
      orderId,
      manifestUrl,
      webhookUrl,
      n8nResponse: responseData
    });
  } catch (error: any) {
    console.error(`[POST /api/orders/[orderId]/trigger-background-removal] Error calling n8n webhook:`, error);
    throw new Error(`Failed to trigger background removal workflow: ${error?.message || error}`);
  }
}

export const POST = withErrorHandling(triggerBackgroundRemoval);

