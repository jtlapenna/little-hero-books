import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAssets, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
function isTableMissingError(error: any, tableName: string) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes(`could not find the table '${tableName}'`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

import { mapSupabaseOrderToOrder, mapManifestToOrder, mergeOrderData } from '@/lib/order-mapper';
import { getActivePreviewToken } from '@/lib/preview-tokens';


async function getOrder(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await params;
  
  // Trim orderId to handle trailing/leading spaces from URL encoding or data entry issues
  const orderId = rawOrderId?.trim() || '';
  
  console.log('[GET /api/orders/[orderId]] Fetching order:', orderId);
  
  // Validate order ID format
  if (!orderId || typeof orderId !== 'string' || orderId.length === 0) {
    throw createValidationError('Invalid order ID provided');
  }
  
  let supabaseOrderRecord: any = null;
  try {
    supabaseOrderRecord = await getOrderFromSupabase(orderId);
    console.log(`[GET /api/orders/[orderId]] Supabase record found for ${orderId}, review_stages:`, JSON.stringify(supabaseOrderRecord?.review_stages || null));
    console.log(`[GET /api/orders/[orderId]] Raw Supabase current_workflow:`, supabaseOrderRecord?.current_workflow);
    console.log(`[GET /api/orders/[orderId]] Raw Supabase execution_status:`, supabaseOrderRecord?.execution_status);
  } catch (error: any) {
    console.warn(
      `[GET /api/orders/[orderId]] Supabase lookup failed for ${orderId}:`,
      error?.message || error
    );
  }

  let supabaseOrder: Order | null = null;
  if (supabaseOrderRecord) {
    try {
      supabaseOrder = await mapSupabaseOrderToOrder(supabaseOrderRecord);
      console.log(`[GET /api/orders/[orderId]] Supabase order loaded for ${orderId}`);
      console.log(`[GET /api/orders/[orderId]] Supabase reviewStages:`, JSON.stringify(supabaseOrder.reviewStages, null, 2));
      console.log(`[GET /api/orders/[orderId]] Mapped currentWorkflow:`, supabaseOrder.currentWorkflow);
      console.log(`[GET /api/orders/[orderId]] Mapped executionStatus:`, supabaseOrder.executionStatus);
    } catch (error: any) {
      console.error(
        `[GET /api/orders/[orderId]] Failed to map Supabase order ${orderId}:`,
        error?.message || error
      );
    }
  } else {
    console.log(`[GET /api/orders/[orderId]] No Supabase record found for ${orderId}`);
  }

  // Try to load manifests for this order for asset details / fallback data
  // Load all manifests that might exist (2a, 2b, 3) to read flags from all stages
  let manifest: any = null;
  let manifestKey = '';
  let loadedStage: string | null = null;
  let manifest2a: any = null;
  let manifest2b: any = null;
  let manifest3: any = null;
  
  // Try to load all manifests in parallel
  const manifestLoadPromises = [
    { stage: '2a' as const, promise: downloadManifest(buildManifestKey(orderId, '2a')).catch(() => null) },
    { stage: '2b' as const, promise: downloadManifest(buildManifestKey(orderId, '2b')).catch(() => null) },
    { stage: '3' as const, promise: downloadManifest(buildManifestKey(orderId, '3')).catch(() => null) }
  ];
  
  const manifestResults = await Promise.all(manifestLoadPromises.map(m => m.promise));
  
  manifest2a = manifestResults[0];
  manifest2b = manifestResults[1];
  manifest3 = manifestResults[2];
  
  // Determine primary manifest (for backward compatibility)
  // Priority: 2b > 2a > 3
  if (manifest2b) {
    manifest = manifest2b;
    loadedStage = '2b';
    console.log(`[GET /api/orders/[orderId]] ✅ Using 2b-manifest as primary for order ${orderId}`);
  } else if (manifest2a) {
    manifest = manifest2a;
    loadedStage = '2a';
    console.log(`[GET /api/orders/[orderId]] ✅ Using 2a-manifest as primary for order ${orderId}`);
  } else if (manifest3) {
    manifest = manifest3;
    loadedStage = '3';
    console.log(`[GET /api/orders/[orderId]] ✅ Using 3-manifest as primary for order ${orderId}`);
  }
  
  // Log which manifests were loaded
  console.log(`[GET /api/orders/[orderId]] Loaded manifests: 2a=${!!manifest2a}, 2b=${!!manifest2b}, 3=${!!manifest3}`);
  
  if (!manifest && !supabaseOrder) {
    console.warn(`[GET /api/orders/[orderId]] ⚠️ No Supabase record or manifest found for ${orderId}`);
    throw createNotFoundError(`Order ${orderId} not found`);
  }
  
  const manifestOrder = manifest ? mapManifestToOrder(orderId, manifest) : null;
  if (manifestOrder) {
    console.log(`[GET /api/orders/[orderId]] Manifest reviewStages:`, JSON.stringify(manifestOrder.reviewStages, null, 2));
  }

  let order: Order;
  if (supabaseOrder) {
    order = mergeOrderData(supabaseOrder, manifestOrder);
    console.log(`[GET /api/orders/[orderId]] Merged reviewStages:`, JSON.stringify(order.reviewStages, null, 2));
    console.log(`[GET /api/orders/[orderId]] Final merged currentWorkflow:`, order.currentWorkflow);
    console.log(`[GET /api/orders/[orderId]] Final merged executionStatus:`, order.executionStatus);
    
    // Verify manifest URLs actually point to existing files
    // If Supabase has a URL but the file doesn't exist in R2, clear the URL
    if (order.manifest2aUrl && !manifest2a) {
      console.log(`[GET /api/orders/[orderId]] ⚠️ Supabase has manifest_2a_url but file doesn't exist in R2, clearing URL`);
      order.manifest2aUrl = undefined;
    }
    if (order.manifest2bUrl && !manifest2b) {
      console.log(`[GET /api/orders/[orderId]] ⚠️ Supabase has manifest_2b_url but file doesn't exist in R2, clearing URL`);
      order.manifest2bUrl = undefined;
    }
    if (order.manifest3Url && !manifest3) {
      console.log(`[GET /api/orders/[orderId]] ⚠️ Supabase has manifest_3_url but file doesn't exist in R2, clearing URL`);
      order.manifest3Url = undefined;
    }
  } else if (manifestOrder) {
    order = manifestOrder;
  } else {
    throw createNotFoundError(`Order ${orderId} not found`);
  }

  try {
    const previewToken = await getActivePreviewToken(order.orderId);
    if (previewToken) {
      // Determine customer site URL based on environment
      // In production, use littleherolabs.com; in development, use localhost
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
      const customerSiteUrl = process.env.CUSTOMER_SITE_URL?.replace(/\/+$/, '') || 
        (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');
      order.customerPreview = {
        token: previewToken.token,
        url: `${customerSiteUrl}/approve/${previewToken.token}`,
        requestedAt:
          order.customerApprovalRequestedAt || previewToken.createdAt,
        expiresAt: previewToken.expiresAt,
        usedAt: previewToken.usedAt || undefined,
      };
    }
  } catch (error: any) {
    console.error(
      `[GET /api/orders/[orderId]] Error fetching preview token for ${order.orderId}:`,
      error?.message || error
    );
  }

  try {
    let correctionsTable = 'customer_contacts';
    const contactsColumns =
      'reason,message,payload,revision_count,last_contacted_at,created_at,updated_at,email,name,description';

    let { data: corrections, error: correctionsError } = await supabase
      .from(correctionsTable)
      .select(contactsColumns)
      .eq('order_id', order.orderId)
      .eq('revision_requested', true)
      .order('last_contacted_at', { ascending: false })
      .limit(1);

    if (correctionsError && isTableMissingError(correctionsError, 'customer_contacts')) {
      correctionsTable = 'customer_feedback';
      const feedbackColumns =
        'issue_type,description,revision_count,created_at,resolved_at,page_number,status';
      ({ data: corrections, error: correctionsError } = await supabase
        .from(correctionsTable)
        .select(feedbackColumns)
        .eq('order_id', order.orderId)
        .order('created_at', { ascending: false })
        .limit(1));
    }

    if (correctionsError && !isTableMissingError(correctionsError, correctionsTable)) {
      console.error(
        `[GET /api/orders/[orderId]] Error fetching customer correction from ${correctionsTable}:`,
        correctionsError
      );
    }

    console.log(
      `[GET /api/orders/[orderId]] correction query (${correctionsTable}) for ${order.orderId}:`,
      { corrections, correctionsError }
    );

    if (corrections && corrections.length > 0) {
      const [row] = corrections;
      let parsedReason: string | null = row.reason ?? row.issue_type ?? null;
      let parsedMessage: string | null = row.message ?? null;
      let parsedPayload: Record<string, unknown> | null = row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : null;
      let parsedEmail: string | null = row.email ?? null;
      let parsedName: string | null = row.name ?? null;

      if (row.description) {
        try {
          const parsed = JSON.parse(row.description);
          if (!parsedReason && typeof parsed?.reason === 'string') {
            parsedReason = parsed.reason;
          }
          if (!parsedMessage && typeof parsed?.message === 'string') {
            parsedMessage = parsed.message;
          }
          if (!parsedPayload && parsed?.fields && typeof parsed.fields === 'object') {
            parsedPayload = parsed.fields as Record<string, unknown>;
          }
          if (!parsedEmail && typeof parsed?.email === 'string') {
            parsedEmail = parsed.email;
          }
          if (!parsedName && typeof parsed?.name === 'string') {
            parsedName = parsed.name;
          }
        } catch (parseError) {
          parsedMessage = parsedMessage || row.description || row.message || 'Customer feedback';
        }
      }

      order.latestCustomerCorrection = {
        reason: parsedReason,
        message: parsedMessage,
        payload: parsedPayload,
        revisionCount: (row.revision_count ?? null) ?? 1,
        submittedAt:
          row.last_contacted_at ?? row.created_at ?? row.updated_at ?? null,
        email: parsedEmail,
        name: parsedName,
      };
    } else {
      order.latestCustomerCorrection = null;
    }
  } catch (correctionCatchError) {
    console.error(
      `[GET /api/orders/[orderId]] Unexpected error loading customer correction:`,
      correctionCatchError
    );
  }
  
  // Get character assets if characterHash is available
  let characterAssets: any[] = [];
  let sharedImageInfo: { isShared: boolean; sourceOrderIds: string[] } | null = null;
  
  if (order.characterHash) {
    try {
      console.log(`[GET /api/orders/[orderId]] Fetching character assets for hash: ${order.characterHash}`);
      characterAssets = await getCharacterAssets(order.characterHash);
      console.log(`[GET /api/orders/[orderId]] Found ${characterAssets.length} character assets`);
      
      // Check if this character hash belongs to other orders (images are being reused)
      // This happens when orders have identical character specs (before the fix) or when images are intentionally shared
      try {
        const { data: ordersWithSameHash, error: hashCheckError } = await supabase
          .from('orders')
          .select('amazon_order_id, orderId, manifest_2a_url, manifest_2b_url')
          .eq('character_hash', order.characterHash)
          .neq('amazon_order_id', orderId)
          .limit(10);
        
        if (!hashCheckError && ordersWithSameHash && ordersWithSameHash.length > 0) {
          const sourceOrderIds = ordersWithSameHash
            .map(o => o.amazon_order_id || o.orderId)
            .filter(Boolean) as string[];
          
          // Check if any source order has 2A or 2B manifest (for button visibility)
          const hasSource2aManifest = ordersWithSameHash.some(o => o.manifest_2a_url);
          const hasSource2bManifest = ordersWithSameHash.some(o => o.manifest_2b_url);
          
          sharedImageInfo = {
            isShared: true,
            sourceOrderIds: sourceOrderIds,
            hasSource2aManifest: hasSource2aManifest,
            hasSource2bManifest: hasSource2bManifest,
          };
          
          console.log(`[GET /api/orders/[orderId]] Character hash ${order.characterHash} is shared with ${sourceOrderIds.length} other order(s):`, sourceOrderIds);
          console.log(`[GET /api/orders/[orderId]] Source orders have 2A manifest: ${hasSource2aManifest}, 2B manifest: ${hasSource2bManifest}`);
          console.log(`[GET /api/orders/[orderId]] Shared image info:`, JSON.stringify(sharedImageInfo, null, 2));
        }
      } catch (error: any) {
        console.warn(`[GET /api/orders/[orderId]] Error checking for shared images:`, error?.message || error);
        // Continue without shared image info
      }
    } catch (error: any) {
      console.error(`[GET /api/orders/[orderId]] Error fetching character assets:`, error?.message || error);
      // Continue without assets rather than failing
    }
  }
  
  if (!manifest) {
    // Always initialize r2Assets, even if no character assets exist yet
    // This ensures the frontend can handle the empty state gracefully
    if (characterAssets.length > 0) {
      const baseCharacter = characterAssets.find((asset) => asset.assetType === 'original') || characterAssets[0];
      order.r2Assets = {
        characterHash: order.characterHash || '',
        baseCharacter: baseCharacter || null,
        poses: characterAssets,
        baseCharacterBgRemoved: null,
        posesBgRemoved: [],
        sharedImageInfo: sharedImageInfo || null, // Indicates if images are shared with other orders
      };
    } else {
      // Initialize with empty arrays so frontend can render empty state
      order.r2Assets = {
        characterHash: order.characterHash || '',
        baseCharacter: null,
        poses: [],
        baseCharacterBgRemoved: null,
        posesBgRemoved: [],
        sharedImageInfo: sharedImageInfo || null, // Indicates if images are shared with other orders
      };
    }
    return NextResponse.json(order);
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
  
  // Use the appropriate manifest for each stage
  // Pre-Bria flags are saved to 2a manifest
  // Post-Bria flags are saved to 2b manifest (or 2a if 2b doesn't exist)
  // Post-PDF flags are saved to 3 manifest
  const preBriaManifest = manifest2a || manifest;
  const postBriaManifest = manifest2b || manifest2a || manifest;
  
  // Get manifest entries to determine expected poses and identify missing/exhausted ones
  // Use preBriaManifest for preBria poses, postBriaManifest for postBria
  const preBriaManifestEntries = preBriaManifest?.entries || [];
  const postBriaManifestEntries = postBriaManifest?.entries || [];
  const manifestEntries = manifest?.entries || [];
  const expectedPoseCount = manifest?.poses?.total || manifestEntries.length || preBriaManifestEntries.length || postBriaManifestEntries.length || 13; // Default to 13 if not specified
  
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
  // Use preBriaManifestEntries for flag data (flags are saved to 2a manifest)
  const preBriaPoses: any[] = [];
  for (let poseNum = 0; poseNum < expectedPoseCount; poseNum++) {
    const existingPose = existingPreBriaMap.get(poseNum);
    const manifestEntry = preBriaManifestEntries.find((e: any) => e.poseNumber === poseNum);
    
    if (existingPose) {
      // Pose exists in R2 - merge manifest entry's review flags if present
      // IMPORTANT: Only use Pre-Bria review reasons (exclude Post-Bria-specific like transparency_fail)
      const postBriaSpecificReasons = ['transparency_fail', 'file_not_found_in_r2', 'not_processed'];
      const reviewReason = manifestEntry?.reviewReason || null;
      const isPostBriaReason = reviewReason && postBriaSpecificReasons.includes(reviewReason);
      
      // Only flag Pre-Bria if the review reason is NOT Post-Bria-specific
      const needsReview = manifestEntry?.needsReview && !isPostBriaReason ? manifestEntry.needsReview : false;
      const preBriaReviewReason = isPostBriaReason ? null : reviewReason;
      // isFlagged should come from manifest entry, not from existingPose (which doesn't have this field)
      const isFlagged = manifestEntry?.isFlagged || needsReview || false;
      
      preBriaPoses.push({
        ...existingPose,
        needsReview: needsReview,
        reviewReason: preBriaReviewReason,
        isFlagged: isFlagged,
        status: manifestEntry?.status || existingPose.status,
        attempts: manifestEntry?.attempts ?? existingPose.attempts,
        approved: manifestEntry?.approved ?? existingPose.approved
      });
      console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Found existing pose with URL, needsReview=${needsReview}, reviewReason=${preBriaReviewReason || 'null'} (filtered Post-Bria: ${isPostBriaReason})`);
    } else {
      // Pose is missing - create placeholder
      console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Creating placeholder (existingPose: ${!!existingPose}, manifestEntry: ${!!manifestEntry})`);
      const isExhausted = manifestEntry?.status === 'exhausted' || manifestEntry?.status === 'failed';
      
      // Filter out Post-Bria-specific review reasons for Pre-Bria placeholders
      const postBriaSpecificReasons = ['transparency_fail', 'file_not_found_in_r2', 'not_processed'];
      const manifestReviewReason = manifestEntry?.reviewReason || null;
      const isPostBriaReason = manifestReviewReason && postBriaSpecificReasons.includes(manifestReviewReason);
      
      // Only use Pre-Bria review reasons (exhausted/missing/not_generated)
      const needsReview = isExhausted || (manifestEntry?.needsReview && !isPostBriaReason);
      const reviewReason = isPostBriaReason 
        ? (isExhausted ? 'missing' : 'not_generated')
        : (manifestReviewReason || (isExhausted ? 'missing' : 'not_generated'));
      
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
  
  // If workflow 2B hasn't run yet, return existing poses from R2 AND any from manifest (manually uploaded)
  // This allows manually uploaded images to appear even if workflow 2B hasn't run
  if (!workflow2BHasRun) {
    console.log(`[GET /api/orders/[orderId]] Workflow 2B has not run yet, checking R2 and manifest for post-Bria poses`);
    
    // Start with existing poses from R2
    const poseMap = new Map(existingPostBriaPoses.map(p => [p.poseNumber, p]));
    
    // Also check manifest for manually uploaded images (have bgRemovedKey but might not be in R2 yet)
    // Use postBriaManifestEntries to get flags from the correct manifest
    postBriaManifestEntries.forEach((entry: any) => {
      if (entry.bgRemovedKey && entry.bgRemovedKey.length > 0) {
        const poseNum = entry.poseNumber;
        // Only add if not already in map (R2 takes precedence)
        if (!poseMap.has(poseNum)) {
          const r2Key = entry.bgRemovedKey;
          const publicUrl = entry.bgRemovedImageUrl || entry.bgRemovedPublicUrl || (order.publicR2Url ? `${order.publicR2Url}/${r2Key}` : null);
          const proxyUrl = publicUrl ? `/api/assets/${r2Key}` : '';
          
          poseMap.set(poseNum, {
            poseNumber: poseNum,
            url: proxyUrl,
            assetType: 'background-removed',
            characterHash: order.characterHash,
            isMissing: !proxyUrl,
            isFlagged: entry.isFlagged || entry.needsReview || false,
            status: entry.status || 'approved',
            needsReview: entry.needsReview || false,
            reviewReason: entry.reviewReason || null,
            attempts: entry.attempts || 0,
            approved: entry.approved || false
          });
        }
      }
    });
    
    postBriaPoses.push(...Array.from(poseMap.values()).sort((a, b) => a.poseNumber - b.poseNumber));
    console.log(`[GET /api/orders/[orderId]] Found ${postBriaPoses.length} post-Bria poses (${existingPostBriaPoses.length} from R2, ${postBriaPoses.length - existingPostBriaPoses.length} from manifest)`);
  } else {
    // Workflow 2B has run - build complete list including placeholders for missing ones
    // If we have existing poses but no manifest entries, just use the existing poses (fallback)
    if (existingPostBriaPoses.length > 0 && postBriaManifestEntries.length === 0) {
      console.log(`[GET /api/orders/[orderId]] No manifest entries found, using existing post-Bria poses only`);
      postBriaPoses.push(...existingPostBriaPoses);
    } else {
      // Normal flow: build complete list including placeholders
      // Use postBriaManifestEntries to get flags from the correct manifest (2b or 2a)
      console.log(`[GET /api/orders/[orderId]] Building post-Bria poses list, expectedPoseCount: ${expectedPoseCount}, existingPostBriaMap size: ${existingPostBriaMap.size}`);
      for (let poseNum = 0; poseNum < expectedPoseCount; poseNum++) {
        const existingPose = existingPostBriaMap.get(poseNum);
        const manifestEntry = postBriaManifestEntries.find((e: any) => e.poseNumber === poseNum);
        
        // Check if manifest has bgRemovedKey
        const hasBgRemovedKey = manifestEntry?.bgRemovedKey && manifestEntry.bgRemovedKey.length > 0;
        
        console.log(`[GET /api/orders/[orderId]] Processing pose ${poseNum}: existingPose=${!!existingPose}, manifestEntry=${!!manifestEntry}, hasBgRemovedKey=${hasBgRemovedKey}, manifestEntry.poseNumber=${manifestEntry?.poseNumber}, manifestEntry.bgRemovedKey=${manifestEntry?.bgRemovedKey || 'null'}`);
        
        if (existingPose) {
          // File exists in R2 - merge manifest entry's review flags if present
          // This handles cases where the file was uploaded but manifest wasn't updated
          const needsReview = manifestEntry?.needsReview || false;
          const reviewReason = manifestEntry?.reviewReason || null;
          // isFlagged should come from manifest entry, not from existingPose (which doesn't have this field)
          const isFlagged = manifestEntry?.isFlagged || needsReview || false;
          
          postBriaPoses.push({
            ...existingPose,
            needsReview: needsReview,
            reviewReason: reviewReason,
            isFlagged: isFlagged,
            status: manifestEntry?.status || existingPose.status,
            attempts: manifestEntry?.attempts ?? existingPose.attempts,
            approved: manifestEntry?.approved ?? existingPose.approved
          });
          console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Found in R2, needsReview=${needsReview}, reviewReason=${reviewReason || 'null'}`);
        } else if (hasBgRemovedKey) {
          // Manifest says it should exist but file not found in R2 - this is unexpected
          // Construct URL from manifest's bgRemovedKey
          const r2Key = manifestEntry.bgRemovedKey;
          const publicUrl = manifestEntry.bgRemovedImageUrl || (order.publicR2Url ? `${order.publicR2Url}/${r2Key}` : null);
          const proxyUrl = publicUrl ? `/api/assets/${r2Key}` : '';
          
          // Use manifest entry's needsReview and reviewReason (e.g., transparency_fail)
          const needsReview = manifestEntry?.needsReview || !proxyUrl;
          const reviewReason = manifestEntry?.reviewReason || (!proxyUrl ? 'file_not_found_in_r2' : null);
          // isFlagged should come from manifest entry
          const isFlagged = manifestEntry?.isFlagged || needsReview || !proxyUrl;
          
          postBriaPoses.push({
            poseNumber: poseNum,
            url: proxyUrl,
            assetType: 'background-removed',
            characterHash: order.characterHash,
            isMissing: !proxyUrl,
            isFlagged: isFlagged,
            status: manifestEntry?.status || 'missing',
            needsReview: needsReview,
            reviewReason: reviewReason,
            attempts: manifestEntry?.attempts || 0,
            approved: manifestEntry?.approved || false
          });
          console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Manifest has bgRemovedKey but file not in R2 map, constructed URL: ${proxyUrl ? 'present' : 'missing'}, needsReview=${needsReview}, reviewReason=${reviewReason || 'null'}`);
        } else {
          // Pose is missing - create placeholder
          const isExhausted = manifestEntry?.status === 'exhausted' || manifestEntry?.status === 'failed';
          const needsReview = manifestEntry?.needsReview || isExhausted;
          // If manifest entry exists but no bgRemovedKey, it means workflow 2B didn't process it
          const reviewReason = manifestEntry && !hasBgRemovedKey 
            ? 'not_processed' 
            : (isExhausted ? 'missing' : 'not_processed');
          
          const placeholder = {
            poseNumber: poseNum,
            url: '', // No URL - will show placeholder in UI
            assetType: 'background-removed',
            characterHash: order.characterHash,
            isMissing: true,
            isFlagged: true, // Automatically flag missing poses
            status: manifestEntry?.status || 'missing',
            needsReview: needsReview,
            reviewReason: reviewReason,
            attempts: manifestEntry?.attempts || 0,
            approved: false
          };
          postBriaPoses.push(placeholder);
          console.log(`[GET /api/orders/[orderId]] Pose ${poseNum}: Missing (no file in R2, no bgRemovedKey in manifest), created placeholder:`, JSON.stringify(placeholder));
        }
      }
      console.log(`[GET /api/orders/[orderId]] Final postBriaPoses count: ${postBriaPoses.length}, poseNumbers: [${postBriaPoses.map(p => p.poseNumber).join(', ')}]`);
    }
  }
  
  // Use the selected base character asset
  const baseCharacter = baseCharacterAsset;
  
  order.r2Assets = {
    baseCharacter,
    poses: preBriaPoses,  // Pre-Bria tab: original images from poses/ directory
    posesBgRemoved: postBriaPoses,  // Post-Bria tab: background-removed images from parent dir
    all: characterAssets,
    characterHash: order.characterHash || '',
    sharedImageInfo: sharedImageInfo || null, // Indicates if images are shared with other orders
  };
  
  console.log(`[GET /api/orders/[orderId]] Returning order with ${characterAssets.length} assets`);
  console.log(`[GET /api/orders/[orderId]] r2Assets.sharedImageInfo:`, order.r2Assets.sharedImageInfo);
  console.log(`[GET /api/orders/[orderId]] poses count: ${preBriaPoses.length}, posesBgRemoved count: ${postBriaPoses.length}`);
  console.log(`[GET /api/orders/[orderId]] Base character:`, baseCharacter ? { url: baseCharacter.url, type: baseCharacter.assetType } : 'null');
  console.log(`[GET /api/orders/[orderId]] Pre-Bria poses: ${preBriaPoses.length}`, preBriaPoses.map(p => ({ poseNumber: p.poseNumber, url: p.url, type: p.assetType })));
  console.log(`[GET /api/orders/[orderId]] Post-Bria poses: ${postBriaPoses.length}`, postBriaPoses.map(p => ({ poseNumber: p.poseNumber, url: p.url, type: p.assetType })));
  
  return NextResponse.json(order);
}

export const GET = withErrorHandling(getOrder);
