import { NextRequest, NextResponse } from 'next/server';
import { getAvailableCharacterHashes, getCharacterAssets, getAvailableOrderIds } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';

async function getOrders(request: NextRequest) {
  console.log('[GET /api/orders] Starting orders fetch...');
  
  // First, try to get orders from the orders bucket (preferred method)
  let orderIds: string[] = [];
  try {
    orderIds = await getAvailableOrderIds();
    console.log('[GET /api/orders] Found', orderIds.length, 'order IDs from orders bucket:', orderIds.slice(0, 5));
  } catch (error: any) {
    console.warn('[GET /api/orders] Error fetching order IDs from orders bucket:', error?.message || error);
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
  
  // Use order IDs if available, otherwise fall back to character hashes
  const sourceList = orderIds.length > 0 ? orderIds : characterHashes;
  
  // Create orders from order IDs or character hashes
  // TODO: In production, load full order data from manifests/database
  console.log('[GET /api/orders] Creating', sourceList.length, 'orders from', orderIds.length > 0 ? 'order IDs' : 'character hashes');
  const orders: Order[] = sourceList.map((idOrHash, index) => {
    // If we have order IDs, use them directly; otherwise extract hash from character hash
    const orderId = orderIds.length > 0 ? idOrHash : `book-${String(index + 1).padStart(3, '0')}-20250116-${idOrHash.substring(0, 6)}`;
    const characterHash = orderIds.length > 0 ? undefined : idOrHash;
    
    return {
      orderId,
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
      status: index === 0 ? 'ai_generation_in_progress' : 'queued_for_processing',
      aiGenerationStartedAt: index === 0 ? new Date(Date.now() - (30 * 60 * 1000)).toISOString() : undefined,
      characterHash,
      characterPath: characterHash ? `characters/${characterHash}` : undefined,
    templatePath: 'templates',
    characterSpecs: {
      childName: `Child${index + 1}`,
      skinTone: ['light', 'medium', 'tan'][index % 3],
      hairColor: ['blonde', 'brown', 'black'][index % 3],
      hairStyle: ['short', 'long', 'curly'][index % 3],
      age: 5 + (index % 3),
      pronouns: 'she/her',
      favoriteColor: ['pink', 'blue', 'green'][index % 3],
      animalGuide: ['tiger', 'unicorn', 'owl'][index % 3],
      clothingStyle: ['dress', 'tunic', 'shirt'][index % 3]
    },
    bookSpecs: {
      title: `Child${index + 1} and the Adventure Compass`,
      totalPages: 16,
      format: '8.5x8.5_softcover',
      bookType: 'animal-guide',
      animalGuide: ['tiger', 'unicorn', 'owl'][index % 3]
    },
    orderDetails: {
      quantity: 1,
      pages: 16,
      format: '8.5x8.5_softcover',
      shippingAddress: {
        name: `Customer${index + 1} Test`,
        address: `${100 + index} Test Street`,
        city: 'Test City',
        state: 'CA',
        zip: '90210'
      }
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
    };
  });

  console.log('[GET /api/orders] Returning', orders.length, 'orders');
  return NextResponse.json(orders);
}

export const GET = withErrorHandling(getOrders);
