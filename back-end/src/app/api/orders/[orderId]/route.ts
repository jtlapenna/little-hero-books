import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAssets, downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { Order } from '@/types/order';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createNotFoundError, createValidationError } from '@/lib/error-handler';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { getArchivedOrderById } from '@/lib/order-lifecycle';
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
  
  // Validate order ID format
  if (!orderId || typeof orderId !== 'string' || orderId.length === 0) {
    throw createValidationError('Invalid order ID provided');
  }
  
  let supabaseOrderRecord: any = null;
  let isArchivedOrder = false;
  
  // First try to find in main orders table
  try {
    supabaseOrderRecord = await getOrderFromSupabase(orderId);
  } catch (error: any) {
    console.warn(
      `[GET /api/orders/[orderId]] Supabase lookup failed for ${orderId}:`,
      error?.message || error
    );
  }

  // If not found, check archived_orders table
  if (!supabaseOrderRecord) {
    try {
      supabaseOrderRecord = await getArchivedOrderById(supabase, orderId);
      if (supabaseOrderRecord) {
        isArchivedOrder = true;
        console.log(`[GET /api/orders/[orderId]] Found archived order ${orderId}`);
      }
    } catch (error: any) {
      console.warn(
        `[GET /api/orders/[orderId]] Archived orders lookup failed for ${orderId}:`,
        error?.message || error
      );
    }
  }

  let supabaseOrder: Order | null = null;
  if (supabaseOrderRecord) {
    try {
      supabaseOrder = await mapSupabaseOrderToOrder(supabaseOrderRecord);
      // Ensure lifecycle_status is preserved for archived orders
      if (isArchivedOrder) {
        supabaseOrder.lifecycle_status = 'archived';
      }
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
  } else if (manifest2a) {
    manifest = manifest2a;
    loadedStage = '2a';
  } else if (manifest3) {
    manifest = manifest3;
    loadedStage = '3';
  }
  
  if (!manifest && !supabaseOrder) {
    console.warn(`[GET /api/orders/[orderId]] ⚠️ No Supabase record or manifest found for ${orderId}`);
    throw createNotFoundError(`Order ${orderId} not found`);
  }
  
  const manifestOrder = manifest ? mapManifestToOrder(orderId, manifest) : null;

  let order: Order;
  if (supabaseOrder) {
    order = mergeOrderData(supabaseOrder, manifestOrder);
    
    // Verify manifest URLs actually point to existing files
    // If Supabase has a URL but the file doesn't exist in R2, clear the URL
    if (order.manifest2aUrl && !manifest2a) {
      order.manifest2aUrl = undefined;
    }
    if (order.manifest2bUrl && !manifest2b) {
      order.manifest2bUrl = undefined;
    }
    if (order.manifest3Url && !manifest3) {
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
      characterAssets = await getCharacterAssets(order.characterHash);
      
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
  
  // Create a map of existing assets by pose number for quick lookup
  // Use order updated_at timestamp for cache-busting to ensure fresh images after workflow reruns
  // This ensures that when workflow 2A reruns and overwrites images, we get fresh URLs
  const orderUpdatedAt = supabaseOrderRecord?.updated_at 
    ? new Date(supabaseOrderRecord.updated_at).getTime() 
    : Date.now();
  // Also use manifest updatedAt for more granular cache-busting per pose
  const manifest2bUpdatedAt = postBriaManifest?.updatedAt 
    ? new Date(postBriaManifest.updatedAt).getTime() 
    : null;
  const cacheBuster = manifest2bUpdatedAt || orderUpdatedAt;
  
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
      url: `${pose.url}${pose.url.includes('?') ? '&' : '?'}v=${cacheBuster}`
    }));
  
  // Create map of existing poses by poseNumber
  const existingPreBriaMap = new Map(existingPreBriaPoses.map(p => [p.poseNumber, p]));
  
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
    } else {
      // Pose is missing - create placeholder
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
  
  const existingPostBriaPoses = characterAssets
    .filter(a => a.assetType === 'background-removed' && a.poseNumber >= 0)
    .sort((a, b) => a.poseNumber - b.poseNumber)
    .map(pose => ({
      ...pose,
      url: `${pose.url}${pose.url.includes('?') ? '&' : '?'}v=${cacheBuster}`
    }));
  
  // Create map of existing post-Bria poses by poseNumber
  const existingPostBriaMap = new Map(existingPostBriaPoses.map(p => [p.poseNumber, p]));
  
  // Build complete list of post-Bria poses
  const postBriaPoses: any[] = [];
  
  // If workflow 2B hasn't run yet, return existing poses from R2 AND any from manifest (manually uploaded)
  // This allows manually uploaded images to appear even if workflow 2B hasn't run
  if (!workflow2BHasRun) {
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
          // Always use our proxy endpoint; it supports BOTH public + orders buckets.
          // Do not require a public URL (orders bucket keys won't have one).
          // Add cache-busting: prioritize replacedAt/sourceReplacedAt (manual replacements) over processedAt
          const replacementTimestamp = entry.replacedAt || entry.sourceReplacedAt;
          const entryProcessedAt = replacementTimestamp
            ? new Date(replacementTimestamp).getTime()
            : (entry.processedAt 
              ? new Date(entry.processedAt).getTime() 
              : manifest2bUpdatedAt || orderUpdatedAt);
          const proxyUrl = r2Key ? `/api/assets/${r2Key}?v=${entryProcessedAt}` : '';
          
          poseMap.set(poseNum, {
            poseNumber: poseNum,
            url: proxyUrl,
            assetType: 'background-removed',
            characterHash: order.characterHash,
            isMissing: !proxyUrl,
            isFlagged: entry.needsReview === true,
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
  } else {
    // Workflow 2B has run - build complete list including placeholders for missing ones
    // If we have existing poses but no manifest entries, just use the existing poses (fallback)
    if (existingPostBriaPoses.length > 0 && postBriaManifestEntries.length === 0) {
      postBriaPoses.push(...existingPostBriaPoses);
    } else {
      // Normal flow: build complete list including placeholders
      // Use postBriaManifestEntries to get flags from the correct manifest (2b or 2a)
      for (let poseNum = 0; poseNum < expectedPoseCount; poseNum++) {
        const existingPose = existingPostBriaMap.get(poseNum);
        const manifestEntry = postBriaManifestEntries.find((e: any) => e.poseNumber === poseNum);
        
        // Check if manifest has bgRemovedKey
        const hasBgRemovedKey = manifestEntry?.bgRemovedKey && manifestEntry.bgRemovedKey.length > 0;
        
        if (existingPose) {
          // File exists in R2 - merge manifest entry's review flags if present
          // This handles cases where the file was uploaded but manifest wasn't updated
          const needsReview = manifestEntry?.needsReview === true;
          const reviewReason = manifestEntry?.reviewReason || null;
          // isFlagged should only be true if needsReview is true (explicit check to avoid stale flags)
          const isFlagged = needsReview === true || (manifestEntry?.isFlagged === true && needsReview === true);
          
          // Update URL with cache-busting: prioritize replacedAt/sourceReplacedAt (manual replacements) over processedAt
          let url = existingPose.url;
          const replacementTimestamp = manifestEntry?.replacedAt || manifestEntry?.sourceReplacedAt;
          const timestampToUse = replacementTimestamp 
            ? new Date(replacementTimestamp).getTime()
            : (manifestEntry?.processedAt 
              ? new Date(manifestEntry.processedAt).getTime() 
              : null);
          if (timestampToUse) {
            // Remove existing cache-buster and add new one
            const baseUrl = url.split('?')[0];
            url = `${baseUrl}?v=${timestampToUse}`;
          }
          
          postBriaPoses.push({
            ...existingPose,
            url,
            needsReview: needsReview,
            reviewReason: reviewReason,
            isFlagged: isFlagged,
            status: manifestEntry?.status || existingPose.status,
            attempts: manifestEntry?.attempts ?? existingPose.attempts,
            approved: manifestEntry?.approved ?? existingPose.approved
          });
        } else if (hasBgRemovedKey) {
          // Manifest says it should exist but file not found in R2 - this is unexpected
          // Construct URL from manifest's bgRemovedKey
          const r2Key = manifestEntry.bgRemovedKey;
          // Always proxy from the key; don't gate on a public URL.
          // Add cache-busting: prioritize replacedAt/sourceReplacedAt (manual replacements) over processedAt
          const replacementTimestamp = manifestEntry.replacedAt || manifestEntry.sourceReplacedAt;
          const entryProcessedAt = replacementTimestamp
            ? new Date(replacementTimestamp).getTime()
            : (manifestEntry.processedAt
              ? new Date(manifestEntry.processedAt).getTime()
              : manifest2bUpdatedAt || orderUpdatedAt);
          const proxyUrl = r2Key ? `/api/assets/${r2Key}?v=${entryProcessedAt}` : '';
          
          // Use manifest entry's needsReview and reviewReason (e.g., transparency_fail)
          const needsReview = manifestEntry?.needsReview === true || !proxyUrl;
          const reviewReason = manifestEntry?.reviewReason || (!proxyUrl ? 'file_not_found_in_r2' : null);
          // isFlagged should only be true if needsReview is true
          const isFlagged = needsReview === true;
          
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
        } else {
          // Pose is missing - create placeholder
          const isExhausted = manifestEntry?.status === 'exhausted' || manifestEntry?.status === 'failed';
          const needsReview = manifestEntry?.needsReview || isExhausted;
          // If manifest entry exists but no bgRemovedKey, it means workflow 2B didn't process it
          const reviewReason = manifestEntry && !hasBgRemovedKey 
            ? 'not_processed' 
            : (isExhausted ? 'missing' : 'not_processed');
          
          postBriaPoses.push({
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
          });
        }
      }
    }
  }
  
  // Use the selected base character asset and add cache-busting
  const baseCharacter = baseCharacterAsset ? {
    ...baseCharacterAsset,
    url: `${baseCharacterAsset.url}${baseCharacterAsset.url.includes('?') ? '&' : '?'}v=${cacheBuster}`
  } : null;
  
  order.r2Assets = {
    baseCharacter,
    poses: preBriaPoses,  // Pre-Bria tab: original images from poses/ directory
    posesBgRemoved: postBriaPoses,  // Post-Bria tab: background-removed images from parent dir
    all: characterAssets,
    characterHash: order.characterHash || '',
    sharedImageInfo: sharedImageInfo || null, // Indicates if images are shared with other orders
  };
  
  return NextResponse.json(order);
}

export const GET = withErrorHandling(getOrder);
