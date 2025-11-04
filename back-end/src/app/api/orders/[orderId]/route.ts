import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAssets, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { getOrderById } from '@/lib/mock-data';
import { getStageStatus } from '@/lib/approval-store';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';

/**
 * Convert manifest data to Order type (same as orders list route)
 */
function manifestToOrder(orderId: string, manifest: any): Order {
  const orderData = manifest?.order || {};
  const workflow = manifest?.workflow || {};
  const characterHash = manifest?.characterHash;
  
  // Determine status from workflow stage
  let status = 'queued_for_processing';
  if (workflow.currentStage === '2A-complete') {
    status = 'ai_generation_in_progress';
  } else if (workflow.currentStage === '2B-complete') {
    status = 'bria_processing_complete';
  } else if (workflow.currentStage === '3-complete') {
    status = 'book_compiled';
  }
  
  // Extract customer name from order data
  const childName = orderData.childName || 'Unknown';
  const nameParts = childName.split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.slice(1).join(' ') || 'Customer';
  
  // Determine review stage status from manifest
  // Default to 'pending' - approval should be explicit, not inferred from workflow stage
  // Workflow stage completion means the process ran, not that it was human-approved
  const reviewStages = {
    preBria: { 
      status: 'pending' as const
    },
    postBria: { 
      status: 'pending' as const
    },
    postPdf: { 
      status: 'pending' as const
    }
  };
  
  return {
    orderId: orderData.orderId || orderId,
    platform: 'amazon',
    amazonOrderId: orderData.amazonOrderId || orderId,
    project: orderData.project || 'book-mvp-simple-adventure',
    customer: {
      firstName,
      lastName,
      email: orderData.customerEmail || `customer@example.com`
    },
    customerEmail: orderData.customerEmail || `customer@example.com`,
    orderDate: manifest?.generatedAt || manifest?.runStamp || new Date().toISOString(),
    status,
    aiGenerationStartedAt: manifest?.runStamp || manifest?.generatedAt,
    characterHash,
    characterPath: characterHash ? `characters/${characterHash}` : undefined,
    templatePath: 'templates',
    characterSpecs: orderData.characterSpecs || {},
    bookSpecs: orderData.bookSpecs || {},
    orderDetails: {
      quantity: orderData.quantity || 1,
      pages: orderData.bookSpecs?.totalPages || 16,
      format: orderData.bookSpecs?.format || '8.5x8.5_softcover',
      shippingAddress: orderData.shippingAddress || {}
    },
    assetPrefix: `book-mvp-simple-adventure/orders/${orderId}/`,
    reviewStages,
    webhooks: {
      onApprove: orderData.webhookUrl || 'https://n8n.example.com/webhook/approve'
    }
  };
}

async function getOrder(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const context = getRequestContext(request);
  
  console.log('[GET /api/orders/[orderId]] Fetching order:', orderId);
  
  // Validate order ID format
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }
  
  // Try to load manifest for this order (same as orders list route)
  let manifest: any = null;
  let manifestKey = '';
  let loadedStage: string | null = null;
  
  for (const stage of ['2a', '2b', '3'] as const) {
    try {
      manifestKey = buildManifestKey(orderId, stage);
      console.log(`[GET /api/orders/[orderId]] Trying to load manifest: ${manifestKey}`);
      manifest = await downloadManifest(manifestKey);
      loadedStage = stage;
      console.log(`[GET /api/orders/[orderId]] ✅ Loaded ${stage}-manifest for order ${orderId}`);
      break; // Successfully loaded, use this manifest
    } catch (err: any) {
      console.log(`[GET /api/orders/[orderId]] ❌ Failed to load ${stage}-manifest: ${err?.message || err}`);
      continue;
    }
  }
  
  if (!manifest) {
    console.warn(`[GET /api/orders/[orderId]] ⚠️ No manifest found for order ${orderId}`);
    throw createNotFoundError(`Order ${orderId} not found`);
  }
  
  // Convert manifest to order
  const order = manifestToOrder(orderId, manifest);
  
  // Get character assets if characterHash is available
  let characterAssets: any[] = [];
  if (order.characterHash) {
    try {
      console.log(`[GET /api/orders/[orderId]] Fetching character assets for hash: ${order.characterHash}`);
      characterAssets = await getCharacterAssets(order.characterHash);
      console.log(`[GET /api/orders/[orderId]] Found ${characterAssets.length} character assets`);
    } catch (error: any) {
      console.error(`[GET /api/orders/[orderId]] Error fetching character assets:`, error?.message || error);
      // Continue without assets rather than failing
    }
  }
  
  // Add R2 assets to order
  // Pre-Bria stage: show only "original" type images (from poses/ directory - 2A images)
  // Post-Bria stage: show only "background-removed" type images (from parent dir with nobg.png - 2B images)
  
  // Base character: find pose 0, prefer original type
  const baseCharacter = characterAssets.find(a => a.poseNumber === 0 && a.assetType === 'original') || 
                       characterAssets.find(a => a.poseNumber === 0 && a.assetType !== 'final') || 
                       characterAssets.find(a => a.assetType === 'original') || 
                       characterAssets[0] || null;
  
  // Pre-Bria poses: only "original" type with poseNumber > 0 (from poses/ directory - 2A images)
  const preBriaPoses = characterAssets
    .filter(a => a.assetType === 'original' && a.poseNumber > 0)
    .sort((a, b) => a.poseNumber - b.poseNumber);
  
  // Post-Bria poses: only "background-removed" type with poseNumber > 0 (from parent dir with nobg.png - 2B images)
  const postBriaPoses = characterAssets
    .filter(a => a.assetType === 'background-removed' && a.poseNumber > 0)
    .sort((a, b) => a.poseNumber - b.poseNumber);
  
  order.r2Assets = {
    baseCharacter,
    poses: preBriaPoses,  // Pre-Bria tab: original images from poses/ directory
    posesBgRemoved: postBriaPoses,  // Post-Bria tab: background-removed images from parent dir
    all: characterAssets
  };
  
  console.log(`[GET /api/orders/[orderId]] Returning order with ${characterAssets.length} assets`);
  console.log(`[GET /api/orders/[orderId]] Base character:`, baseCharacter ? { url: baseCharacter.url, type: baseCharacter.assetType } : 'null');
  console.log(`[GET /api/orders/[orderId]] Pre-Bria poses: ${preBriaPoses.length}`, preBriaPoses.map(p => ({ poseNumber: p.poseNumber, url: p.url, type: p.assetType })));
  console.log(`[GET /api/orders/[orderId]] Post-Bria poses: ${postBriaPoses.length}`, postBriaPoses.map(p => ({ poseNumber: p.poseNumber, url: p.url, type: p.assetType })));
  
  return NextResponse.json(order);
}

export const GET = withErrorHandling(getOrder);
