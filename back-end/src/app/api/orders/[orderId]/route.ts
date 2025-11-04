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
  
  // Extract customer name from order data (check both top-level and characterSpecs)
  const childName = orderData.childName || orderData.characterSpecs?.childName || 'Unknown';
  const nameParts = childName.split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.slice(1).join(' ') || 'Customer';
  
  // Extract characterSpecs with fallbacks from top-level orderData fields
  // Character specs might be in orderData.characterSpecs or as top-level fields
  const characterSpecs = {
    childName: orderData.characterSpecs?.childName || orderData.childName || undefined,
    age: orderData.characterSpecs?.age || orderData.age || undefined,
    skinTone: orderData.characterSpecs?.skinTone || orderData.skinTone || undefined,
    hairColor: orderData.characterSpecs?.hairColor || orderData.hairColor || undefined,
    hairStyle: orderData.characterSpecs?.hairStyle || orderData.hairStyle || undefined,
    animalGuide: orderData.characterSpecs?.animalGuide || orderData.animalGuide || orderData.characterSpecs?.favoriteAnimal || orderData.favoriteAnimal || undefined,
    clothingStyle: orderData.characterSpecs?.clothingStyle || orderData.clothingStyle || undefined,
    favoriteColor: orderData.characterSpecs?.favoriteColor || orderData.favoriteColor || undefined,
    favoriteFood: orderData.characterSpecs?.favoriteFood || orderData.favoriteFood || undefined,
    ...(orderData.characterSpecs || {})  // Include any other characterSpecs fields
  };
  
  // Extract bookSpecs with fallbacks and construct title if missing
  const extractedChildName = characterSpecs.childName || childName;
  const bookTitle = orderData.bookSpecs?.title || 
                   orderData.bookTitle || 
                   (extractedChildName && extractedChildName !== 'Unknown' ? `${extractedChildName} and the Adventure Compass` : undefined);
  
  const bookSpecs = {
    title: bookTitle,
    totalPages: orderData.bookSpecs?.totalPages || orderData.totalPages || 16,
    format: orderData.bookSpecs?.format || orderData.format || '8.5x8.5_softcover',
    ...(orderData.bookSpecs || {})  // Include any other bookSpecs fields
  };
  
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
    characterSpecs,
    bookSpecs,
    orderDetails: {
      quantity: orderData.quantity || 1,
      pages: bookSpecs.totalPages,
      format: bookSpecs.format,
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
  let order = manifestToOrder(orderId, manifest);
  
  // If characterSpecs or bookSpecs are empty, try to fetch from Amazon SP-API or use fallbacks
  const orderData = manifest?.order || {};
  const hasEmptyCharacterSpecs = !order.characterSpecs || Object.keys(order.characterSpecs).length === 0 || 
                                  (!order.characterSpecs.childName && !order.characterSpecs.age && !order.characterSpecs.skinTone);
  const hasEmptyBookSpecs = !order.bookSpecs || Object.keys(order.bookSpecs).length === 0 || !order.bookSpecs.title;
  
  if (hasEmptyCharacterSpecs || hasEmptyBookSpecs) {
    console.log(`[GET /api/orders/[orderId]] ⚠️ Empty characterSpecs or bookSpecs in manifest, attempting to fetch from Amazon SP-API...`);
    
    const amazonOrderId = order.amazonOrderId || orderData.amazonOrderId || orderId;
    
    // Try to fetch from Amazon SP-API middleware if available
    // Check for AMAZON_MIDDLEWARE_URL environment variable
    const amazonMiddlewareUrl = process.env.AMAZON_MIDDLEWARE_URL;
    
    if (amazonMiddlewareUrl && amazonOrderId && amazonOrderId !== orderId) {
      try {
        console.log(`[GET /api/orders/[orderId]] Attempting to fetch customization from Amazon SP-API for ${amazonOrderId}`);
        const customizationResponse = await fetch(`${amazonMiddlewareUrl}/orders/${amazonOrderId}/parse-customization`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (customizationResponse.ok) {
          const customizationData = await customizationResponse.json();
          const firstItem = customizationData.customizationData?.[0];
          
          if (firstItem?.customization) {
            const custom = firstItem.customization;
            console.log(`[GET /api/orders/[orderId]] ✅ Retrieved customization data from Amazon SP-API`);
            
            // Merge Amazon customization data into characterSpecs
            if (hasEmptyCharacterSpecs) {
              order.characterSpecs = {
                childName: custom.childName || custom.child_name || custom.name || undefined,
                age: custom.childAge || custom.age ? parseInt(custom.childAge || custom.age, 10) : undefined,
                skinTone: custom.skinTone || custom.skin_tone || custom.skin || undefined,
                hairColor: custom.hairColor || custom.hair_color || custom.hair || undefined,
                hairStyle: custom.hairStyle || custom.hair_style || undefined,
                animalGuide: custom.animalGuide || custom.favoriteAnimal || custom.favorite_animal || custom.animal || undefined,
                clothingStyle: custom.clothingStyle || custom.clothing_style || custom.clothing || undefined,
                favoriteColor: custom.favoriteColor || custom.favorite_color || custom.color || undefined,
                favoriteFood: custom.favoriteFood || custom.favorite_food || custom.food || undefined,
                ...order.characterSpecs
              };
            }
          }
        }
      } catch (error: any) {
        console.warn(`[GET /api/orders/[orderId]] ⚠️ Could not fetch from Amazon SP-API: ${error?.message || error}`);
        // Continue without Amazon data
      }
    }
    
    // If still empty after Amazon fetch, try to construct book title from orderId as fallback
    if (hasEmptyBookSpecs && !order.bookSpecs.title) {
      // For test orders, try to extract a name from orderId
      const extractedName = amazonOrderId && amazonOrderId.startsWith('TEST-') 
        ? amazonOrderId.replace('TEST-ORDER-', '').replace(/^0+/, '') || 'Adventure Hero'
        : 'Adventure Hero';
      
      order.bookSpecs = {
        ...order.bookSpecs,
        title: order.characterSpecs?.childName 
          ? `${order.characterSpecs.childName} and the Adventure Compass`
          : `${extractedName} and the Adventure Compass`
      };
    }
    
    // Log what we have
    console.log(`[GET /api/orders/[orderId]] Final characterSpecs:`, {
      hasChildName: !!order.characterSpecs?.childName,
      hasAge: !!order.characterSpecs?.age,
      hasSkinTone: !!order.characterSpecs?.skinTone,
      keys: Object.keys(order.characterSpecs || {})
    });
    console.log(`[GET /api/orders/[orderId]] Final bookSpecs:`, {
      hasTitle: !!order.bookSpecs?.title,
      totalPages: order.bookSpecs?.totalPages,
      format: order.bookSpecs?.format
    });
  }
  
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
  // Add cache-busting timestamp to ensure images refresh when overwritten in R2
  const cacheBuster = Date.now();
  const postBriaPoses = characterAssets
    .filter(a => a.assetType === 'background-removed' && a.poseNumber > 0)
    .sort((a, b) => a.poseNumber - b.poseNumber)
    .map(pose => ({
      ...pose,
      url: `${pose.url}${pose.url.includes('?') ? '&' : '?'}t=${cacheBuster}`
    }));
  
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
