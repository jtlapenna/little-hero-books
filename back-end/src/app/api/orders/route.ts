import { NextRequest, NextResponse } from 'next/server';
import { getAvailableCharacterHashes, getCharacterAssets } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';

async function getOrders(request: NextRequest) {
  // Get available character hashes from R2
  const characterHashes = await getAvailableCharacterHashes();
  
  // If no character hashes found (R2 not configured), return empty array
  // The frontend will fall back to mock data
  if (characterHashes.length === 0) {
    return NextResponse.json([]);
  }
  
  // For now, we'll create orders based on available character hashes
  // In a real implementation, this would come from a database
  const orders: Order[] = characterHashes.map((hash, index) => ({
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
    status: index === 0 ? 'ai_generation_in_progress' : 'queued_for_processing',
    aiGenerationStartedAt: index === 0 ? new Date(Date.now() - (30 * 60 * 1000)).toISOString() : undefined,
    characterHash: hash,
    characterPath: `characters/${hash}`,
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
    assetPrefix: `projects/personalized-book/orders/book-${String(index + 1).padStart(3, '0')}-20250116-${hash.substring(0, 6)}/`,
    reviewStages: {
      preBria: { status: 'pending' },
      postBria: { status: 'pending' },
      postPdf: { status: 'pending' }
    },
    webhooks: {
      onApprove: 'https://n8n.example.com/webhook/approve'
    }
  }));

  return NextResponse.json(orders);
}

export const GET = withErrorHandling(getOrders);
