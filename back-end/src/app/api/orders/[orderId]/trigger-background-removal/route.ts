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

  // Get public R2 URL from manifest or construct it
  // The manifest has publicR2Url for assets, but we need to construct the orders bucket URL
  // R2 public buckets use the format: https://pub-{PUBLIC_BUCKET_ID}.r2.dev/{bucket}/{key}
  const assetsPublicR2Url = manifest?.order?.publicR2Url;
  const publicR2Url = process.env.R2_PUBLIC_URL || assetsPublicR2Url ||
    (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID
      ? `https://pub-${process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID}.r2.dev`
      : null);

  if (!publicR2Url) {
    throw new Error('Public R2 URL not configured. Set R2_PUBLIC_URL or ensure manifest has publicR2Url');
  }

  // Construct manifest URL
  // Format: https://pub-{PUBLIC_BUCKET_ID}.r2.dev/{bucket}/{key}
  const manifestKey = buildManifestKey(orderId, '2a');
  const ordersBucket = process.env.R2_ORDERS_BUCKET_NAME || 'little-hero-orders';
  const manifestUrl = `${publicR2Url}/${ordersBucket}/${manifestKey}`;

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

