import { NextRequest, NextResponse } from 'next/server';
import { getAvailableCharacterHashes, getCharacterAssets, getAvailableOrderIds, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';

/**
 * Convert manifest data to Order type
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
  const reviewStages = {
    preBria: { 
      status: workflow.currentStage === '2A-complete' ? 'approved' : 'pending' as const
    },
    postBria: { 
      status: workflow.currentStage === '2B-complete' ? 'approved' : 'pending' as const
    },
    postPdf: { 
      status: workflow.currentStage === '3-complete' ? 'approved' : 'pending' as const
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

async function getOrders(request: NextRequest) {
  console.log('[GET /api/orders] Starting orders fetch...');
  
  // First, try to get orders from the orders bucket (preferred method)
  let orderIds: string[] = [];
  try {
    orderIds = await getAvailableOrderIds();
    console.log('[GET /api/orders] Found', orderIds.length, 'order IDs from orders bucket:', orderIds.slice(0, 5));
    console.log('[GET /api/orders] All order IDs:', orderIds);
  } catch (error: any) {
    console.error('[GET /api/orders] Error fetching order IDs from orders bucket:', {
      message: error?.message,
      name: error?.name,
      code: error?.$metadata?.httpStatusCode,
      stack: error?.stack
    });
    // Fall back to character hashes method
  }
  
  // Fallback: Get available character hashes from R2 if no order IDs found
  let characterHashes: string[] = [];
  if (orderIds.length === 0) {
    try {
      characterHashes = await getAvailableCharacterHashes();
      console.log('[GET /api/orders] Found', characterHashes.length, 'character hashes:', characterHashes.slice(0, 5));
    } catch (error: any) {
      console.error('[GET /api/orders] Error fetching character hashes:', error?.message || error);
    }
  }
  
  // If no orders or character hashes found (R2 not configured or error), return empty array
  // The frontend will fall back to mock data
  if (orderIds.length === 0 && characterHashes.length === 0) {
    console.warn('[GET /api/orders] No orders or character hashes found. Returning empty array. Frontend will use mock data.');
    return NextResponse.json([]);
  }
  
  // Load orders from manifests if we have order IDs
  const orders: Order[] = [];
  
  if (orderIds.length > 0) {
    console.log('[GET /api/orders] Loading manifests for', orderIds.length, 'orders');
    
    // Try to load 2a manifest for each order (most recent workflow stage)
    for (const orderId of orderIds) {
      console.log(`[GET /api/orders] Processing order: ${orderId}`);
      try {
        // Try 2a first (most common), then 2b, then 3
        let manifest: any = null;
        let manifestKey = '';
        let loadedStage: string | null = null;
        const errors: string[] = [];
        
        for (const stage of ['2a', '2b', '3'] as const) {
          try {
            manifestKey = buildManifestKey(orderId, stage);
            console.log(`[GET /api/orders] Trying to load manifest: ${manifestKey}`);
            manifest = await downloadManifest(manifestKey);
            loadedStage = stage;
            console.log(`[GET /api/orders] ✅ Loaded ${stage}-manifest for order ${orderId}`);
            break; // Successfully loaded, use this manifest
          } catch (err: any) {
            const errorMsg = `Failed to load ${stage}-manifest: ${err?.message || err}`;
            errors.push(errorMsg);
            console.log(`[GET /api/orders] ❌ ${errorMsg}`);
            // Continue to next stage
            continue;
          }
        }
        
        if (manifest) {
          console.log(`[GET /api/orders] Converting manifest to order for ${orderId} (stage: ${loadedStage})`);
          const order = manifestToOrder(orderId, manifest);
          orders.push(order);
          console.log(`[GET /api/orders] ✅ Added order ${orderId} to results`);
        } else {
          console.warn(`[GET /api/orders] ⚠️ No manifest found for order ${orderId}`, {
            triedStages: ['2a', '2b', '3'],
            errors
          });
          // Create a basic order entry if manifest is missing
          orders.push({
            orderId,
            platform: 'amazon',
            amazonOrderId: orderId,
            project: 'book-mvp-simple-adventure',
            customer: {
              firstName: 'Unknown',
              lastName: 'Customer',
              email: 'unknown@example.com'
            },
            customerEmail: 'unknown@example.com',
            orderDate: new Date().toISOString(),
            status: 'queued_for_processing',
            templatePath: 'templates',
            characterSpecs: {},
            bookSpecs: {},
            orderDetails: {
              quantity: 1,
              pages: 16,
              format: '8.5x8.5_softcover'
            },
            assetPrefix: `book-mvp-simple-adventure/orders/${orderId}/`,
            reviewStages: {
              preBria: { status: 'pending' },
              postBria: { status: 'pending' },
              postPdf: { status: 'pending' }
            },
            webhooks: {
              onApprove: 'https://n8n.example.com/webhook/approve'
            }
          });
        }
      } catch (error: any) {
        console.error(`[GET /api/orders] Error loading manifest for order ${orderId}:`, error?.message || error);
        // Continue with other orders
      }
    }
  } else {
    // Fallback: Create orders from character hashes (legacy behavior)
    console.log('[GET /api/orders] Creating orders from character hashes (fallback mode)');
    orders.push(...characterHashes.map((hash, index) => ({
      orderId: `book-${String(index + 1).padStart(3, '0')}-20250116-${hash.substring(0, 6)}`,
      platform: 'amazon',
      amazonOrderId: `TEST-ORDER-${String(index + 1).padStart(3, '0')}`,
      project: 'personalized-book',
      customer: {
        firstName: `Customer${index + 1}`,
        lastName: 'Test',
        email: `customer${index + 1}@example.com`
      },
      customerEmail: `customer${index + 1}@example.com`,
      orderDate: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)).toISOString(),
      status: 'queued_for_processing',
      characterHash: hash,
      characterPath: `characters/${hash}`,
      templatePath: 'templates',
      characterSpecs: {},
      bookSpecs: {},
      orderDetails: {
        quantity: 1,
        pages: 16,
        format: '8.5x8.5_softcover'
      },
      assetPrefix: `book-mvp-simple-adventure/orders/book-${String(index + 1).padStart(3, '0')}/`,
      reviewStages: {
        preBria: { status: 'pending' },
        postBria: { status: 'pending' },
        postPdf: { status: 'pending' }
      },
      webhooks: {
        onApprove: 'https://n8n.example.com/webhook/approve'
      }
    })));
  }

  console.log('[GET /api/orders] Returning', orders.length, 'orders');
  return NextResponse.json(orders);
}

export const GET = withErrorHandling(getOrders);
