import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAssets, getAvailableCharacterHashes } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { getOrderById } from '@/lib/mock-data';
import { getStageStatus } from '@/lib/approval-store';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';

async function getOrder(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const context = getRequestContext(request, { params: { orderId } });
  
  console.log('API: Fetching order:', orderId);
  
  // Validate order ID format
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }
  
  // Extract character hash from order ID or use a default
  // In a real implementation, this would come from a database
  // The order ID format is: book-001-20250116-0ccbbb
  // But the actual character hash in R2 is: 0ccbbb2ece0d4a46
  // For now, let's use a mapping or try to find the full hash
  const shortHash = orderId.split('-').pop() || '1dde0fac84943088';
  console.log('API: Short hash from order ID:', shortHash);
  
  // Try to find the full character hash that starts with the short hash
  const availableHashes = await getAvailableCharacterHashes();
  console.log('API: Available hashes:', availableHashes);
  const characterHash = availableHashes.find(hash => hash.startsWith(shortHash)) || '1dde0fac84943088';
  console.log('API: Using character hash:', characterHash);
  
  // Get character assets from R2
  const characterAssets = await getCharacterAssets(characterHash);
  console.log('API: Character assets for', characterHash, ':', characterAssets);
  
  // Create order object with R2 data (since we're generating orders from R2)
  const order: Order = {
    orderId,
    platform: 'amazon',
    amazonOrderId: `TEST-ORDER-${orderId.split('-')[1]}`,
    project: 'personalized-book',
    customer: {
      firstName: 'Alex',
      lastName: 'Doe',
      email: 'test@example.com'
    },
    customerEmail: 'test@example.com',
    orderDate: '2025-10-17T12:51:50.815Z',
    status: 'ai_generation_in_progress',
    aiGenerationStartedAt: '2025-10-17T10:35:00.000Z',
    characterHash,
    characterPath: `characters/${characterHash}`,
    templatePath: 'templates',
    characterSpecs: {
      childName: 'Alex',
      skinTone: 'tan',
      hairColor: 'blonde',
      hairStyle: 'straight-short',
      age: 5,
      pronouns: 'she/her',
      favoriteColor: 'black',
      animalGuide: 'tiger',
      clothingStyle: 'dress'
    },
    bookSpecs: {
      title: 'Alex and the Adventure Compass',
      totalPages: 16,
      format: '8.5x8.5_softcover',
      bookType: 'animal-guide',
      animalGuide: 'tiger'
    },
    orderDetails: {
      quantity: 1,
      pages: 16,
      format: '8.5x8.5_softcover',
      shippingAddress: {
        name: 'Test Customer',
        address: '123 Test Street',
        city: 'Test City',
        state: 'CA',
        zip: '90210'
      }
    },
    assetPrefix: `projects/personalized-book/orders/${orderId}/`,
    reviewStages: {
      preBria: { 
        status: characterAssets.posesBgRemoved && characterAssets.posesBgRemoved.length > 0 
          ? 'approved'  // If Post-Bria images exist, Pre-Bria must have been approved
          : await getStageStatus(orderId, 'preBria')
      },
      postBria: { 
        status: await getStageStatus(orderId, 'postBria')  // Check actual approval status
      },
      postPdf: { 
        status: await getStageStatus(orderId, 'postPdf')  // PDF approval is always explicit
      }
    },
    webhooks: {
      onApprove: 'https://n8n.example.com/webhook/approve'
    },
    // Add R2 assets data
    r2Assets: characterAssets
  };

  return NextResponse.json(order);
}

export const GET = withErrorHandling(getOrder);
