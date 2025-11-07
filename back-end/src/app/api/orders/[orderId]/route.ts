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
  
  // Base character: prefer base-character.png specifically, fallback to pose0
  // We want to show pose0 in Character Poses, so base character should be base-character.png if it exists
  const baseCharacterAsset = characterAssets.find(a => {
    const url = a.url.toLowerCase();
    return url.includes('base-character') && a.assetType === 'original';
  }) || characterAssets.find(a => a.poseNumber === 0 && a.assetType === 'original') || 
       characterAssets.find(a => a.poseNumber === 0 && a.assetType !== 'final') || 
       characterAssets.find(a => a.assetType === 'original') || 
       characterAssets[0] || null;
  
  // Get pose0 asset separately (this is pose00.png, not base-character.png)
  const pose0Asset = characterAssets.find(a => {
    const url = a.url.toLowerCase();
    // pose0 should be pose00.png or similar, NOT base-character.png
    return a.poseNumber === 0 && a.assetType === 'original' && !url.includes('base-character');
  });
  
  const baseCharacterUrl = baseCharacterAsset?.url?.toLowerCase() || '';
  const pose0Url = pose0Asset?.url?.toLowerCase() || '';
  const isBaseCharacterSameAsPose0 = baseCharacterUrl && pose0Url && baseCharacterUrl === pose0Url;
  
  // Get manifest entries to determine expected poses and identify missing/exhausted ones
  const manifestEntries = manifest?.entries || [];
  const expectedPoseCount = manifest?.poses?.total || manifestEntries.length || 13; // Default to 13 if not specified
  
  console.log(`[GET /api/orders/[orderId]] Expected pose count: ${expectedPoseCount}, Manifest entries: ${manifestEntries.length}, Character assets: ${characterAssets.length}`);
  console.log(`[GET /api/orders/[orderId]] Character assets sample:`, characterAssets.slice(0, 3).map(a => ({ poseNumber: a.poseNumber, assetType: a.assetType, url: a.url?.substring(0, 50) })));
  
  // Create a map of existing assets by pose number for quick lookup
  const cacheBuster = Date.now();
  
  // Pre-Bria poses: all "original" type images including pose0 (poseNumber >= 0)
  // But exclude base-character.png from poses (it's shown in Base Character section)
  const existingPreBriaPoses = characterAssets
    .filter(a => {
      if (a.assetType !== 'original' || a.poseNumber < 0) return false;
      // Always exclude base-character.png from poses (it's shown separately in Base Character section)
      const url = a.url.toLowerCase();
      if (url.includes('base-character')) return false;
      return true;
    })
    .sort((a, b) => a.poseNumber - b.poseNumber)
    .map(pose => ({
      ...pose,
      url: `${pose.url}${pose.url.includes('?') ? '&' : '?'}t=${cacheBuster}`
    }));
  
  console.log(`[GET /api/orders/[orderId]] Found ${existingPreBriaPoses.length} existing pre-Bria poses:`, existingPreBriaPoses.map(p => ({ poseNumber: p.poseNumber, url: p.url?.substring(0, 60) })));
  
  // Create map of existing poses by poseNumber
  const existingPreBriaMap = new Map(existingPreBriaPoses.map(p => [p.poseNumber, p]));
  console.log(`[GET /api/orders/[orderId]] Pre-Bria map keys:`, Array.from(existingPreBriaMap.keys()));
  
  // Build complete list of pre-Bria poses, including placeholders for missing/exhausted ones
  const preBriaPoses: any[] = [];
  for (let poseNum = 0; poseNum < expectedPoseCount; poseNum++) {
    const existingPose = existingPreBriaMap.get(poseNum);
    const manifestEntry = manifestEntries.find((e: any) => e.poseNumber === poseNum);
    
    if (existingPose) {
      // Pose exists in R2
      console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Found existing pose with URL`);
      preBriaPoses.push(existingPose);
    } else {
      // Pose is missing - create placeholder
      console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Creating placeholder (existingPose: ${!!existingPose}, manifestEntry: ${!!manifestEntry})`);
      const isExhausted = manifestEntry?.status === 'exhausted' || manifestEntry?.status === 'failed';
      const needsReview = manifestEntry?.needsReview || isExhausted;
      const reviewReason = manifestEntry?.reviewReason || (isExhausted ? 'missing' : 'not_generated');
      
      preBriaPoses.push({
        poseNumber: poseNum,
        url: '', // No URL - will show placeholder in UI
        assetType: 'original',
        characterHash: order.characterHash,
        isMissing: true,
        isFlagged: true, // Automatically flag missing poses
        status: manifestEntry?.status || 'missing',
        needsReview: needsReview,
        reviewReason: reviewReason,
        attempts: manifestEntry?.attempts || 0,
        approved: false
      });
    }
  }
  
  // Post-Bria poses: all "background-removed" type images including pose0 (poseNumber >= 0)
  // Only create placeholders if workflow 2B has been run (loadedStage is '2b' or '3', or workflow.currentStage is '2B-complete' or later)
  const workflow2BHasRun = loadedStage === '2b' || loadedStage === '3' || 
                            manifest?.workflow?.currentStage === '2B-complete' || 
                            manifest?.workflow?.currentStage === '3-complete';
  
  console.log(`[GET /api/orders/[orderId]] Workflow 2B has run: ${workflow2BHasRun}, loadedStage: ${loadedStage}, currentStage: ${manifest?.workflow?.currentStage}`);
  
  const existingPostBriaPoses = characterAssets
    .filter(a => a.assetType === 'background-removed' && a.poseNumber >= 0)
    .sort((a, b) => a.poseNumber - b.poseNumber)
    .map(pose => ({
      ...pose,
      url: `${pose.url}${pose.url.includes('?') ? '&' : '?'}t=${cacheBuster}`
    }));
  
  console.log(`[GET /api/orders/[orderId]] Found ${existingPostBriaPoses.length} existing post-Bria poses:`, existingPostBriaPoses.map(p => ({ poseNumber: p.poseNumber, url: p.url })));
  
  // Create map of existing post-Bria poses by poseNumber
  const existingPostBriaMap = new Map(existingPostBriaPoses.map(p => [p.poseNumber, p]));
  
  // Build complete list of post-Bria poses
  const postBriaPoses: any[] = [];
  
  // If workflow 2B hasn't run yet, only return existing poses (if any) - don't create placeholders
  if (!workflow2BHasRun) {
    console.log(`[GET /api/orders/[orderId]] Workflow 2B has not run yet, returning only existing post-Bria poses (no placeholders)`);
    postBriaPoses.push(...existingPostBriaPoses);
  } else {
    // Workflow 2B has run - build complete list including placeholders for missing ones
    // If we have existing poses but no manifest entries, just use the existing poses (fallback)
    if (existingPostBriaPoses.length > 0 && manifestEntries.length === 0) {
      console.log(`[GET /api/orders/[orderId]] No manifest entries found, using existing post-Bria poses only`);
      postBriaPoses.push(...existingPostBriaPoses);
    } else {
      // Normal flow: build complete list including placeholders
      for (let poseNum = 0; poseNum < expectedPoseCount; poseNum++) {
        const existingPose = existingPostBriaMap.get(poseNum);
        const manifestEntry = manifestEntries.find((e: any) => e.poseNumber === poseNum);
        
        if (existingPose) {
          // Pose exists in R2
          postBriaPoses.push(existingPose);
        } else {
          // Pose is missing - create placeholder (only if workflow 2B has run)
          const preBriaEntry = manifestEntries.find((e: any) => e.poseNumber === poseNum);
          const isExhausted = preBriaEntry?.status === 'exhausted' || preBriaEntry?.status === 'failed';
          const needsReview = preBriaEntry?.needsReview || isExhausted;
          const reviewReason = preBriaEntry?.reviewReason || (isExhausted ? 'missing' : 'not_processed');
          
          postBriaPoses.push({
            poseNumber: poseNum,
            url: '', // No URL - will show placeholder in UI
            assetType: 'background-removed',
            characterHash: order.characterHash,
            isMissing: true,
            isFlagged: true, // Automatically flag missing poses
            status: preBriaEntry?.status || 'missing',
            needsReview: needsReview,
            reviewReason: reviewReason,
            attempts: preBriaEntry?.attempts || 0,
            approved: false
          });
        }
      }
    }
  }
  
  // Use the selected base character asset
  const baseCharacter = baseCharacterAsset;
  
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
