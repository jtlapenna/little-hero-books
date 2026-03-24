'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AssetGrid } from '@/components/assets/asset-grid';
import { CheckCircle, Play, Eye, RefreshCw, Info } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';
import { extractApiErrorMessage } from '@/lib/error-handler';
import { DEFAULT_BOOK_ID, resolveOrderPathContext } from '@/lib/order-paths';

interface PostBriaStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: (nextStatus: 'approved' | 'pending') => Promise<void> | void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
}

type PostBriaAssetLike = Record<string, unknown> & {
  assetType?: unknown;
  url?: unknown;
  poseNumber?: unknown;
};

function isBackgroundRemovedAsset(asset: PostBriaAssetLike): boolean {
  const assetType = typeof asset?.assetType === 'string' ? asset.assetType.toLowerCase() : '';
  const url = typeof asset?.url === 'string' ? asset.url : '';

  return (
    assetType === 'background-removed' ||
    /(?:_|-)nobg\.(?:png|webp)(?:\?|$)/i.test(url)
  );
}

function getPostBriaPoseAssets(r2Assets: Order['r2Assets'] | undefined): PostBriaAssetLike[] {
  if (Array.isArray(r2Assets?.posesBgRemoved) && r2Assets.posesBgRemoved.length > 0) {
    return r2Assets.posesBgRemoved as PostBriaAssetLike[];
  }

  const fallbackAssets = Array.isArray(r2Assets?.poses)
    ? r2Assets.poses.filter(isBackgroundRemovedAsset)
    : [];

  if (fallbackAssets.length === 0) {
    return [];
  }

  const dedupedAssets = new Map<string, PostBriaAssetLike>();

  for (let index = 0; index < fallbackAssets.length; index += 1) {
    const asset = fallbackAssets[index];
    const key =
      typeof asset?.poseNumber === 'number'
        ? `pose:${asset.poseNumber}`
        : `url:${asset?.url ?? index}`;
    const current = dedupedAssets.get(key);

    if (!current || (!current.url && asset?.url)) {
      dedupedAssets.set(key, asset);
    }
  }

  return Array.from(dedupedAssets.values());
}

export function PostBriaStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow, onRefresh }: PostBriaStageProps) {
  const [showBlackBackground, setShowBlackBackground] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [approveStageConfirmed, setApproveStageConfirmed] = useState(!!isApproved);

  // keep local confirm state in sync if parent updates
  useEffect(() => {
    setApproveStageConfirmed(!!isApproved);
  }, [isApproved]);

  // On-demand cache-bust counter — only incremented by explicit user actions (replace, flip, refresh).
  const [bustCounter, setBustCounter] = useState(0);
  const bumpBust = useCallback(() => setBustCounter(c => c + 1), []);

  function getBustToken(): string {
    const updatedAtMs = order?.updatedAt ? Date.parse(order.updatedAt) : 0;
    return `${Number.isFinite(updatedAtMs) ? updatedAtMs : 0}-${bustCounter}`;
  }

  function withCacheBust(url: string, token: string): string {
    const u = String(url || '').trim();
    if (!u) return u;
    // Replace existing v=... if present; otherwise append.
    if (/[?&]v=/.test(u)) return u.replace(/([?&])v=[^&]*/g, `$1v=${token}`);
    return `${u}${u.includes('?') ? '&' : '?'}v=${token}`;
  }
  
  // Initialize with empty state - will be populated from R2 data
  const [poses, setPoses] = useState<Array<{ id: string; name: string; url: string; isFlagged: boolean; hasTransparentBackground: boolean; isMissing?: boolean; status?: string; reviewReason?: string; attempts?: number; comparisonMode?: 'reference' | 'background' | null; comparisonImageUrl?: string; comparisonLabel?: string; poseNumber?: number; pageNumber?: number; onFlip?: () => void; isFlipping?: boolean }>>([]);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);
  const [flippingPoseId, setFlippingPoseId] = useState<string | null>(null);
  const orderPathContext = resolveOrderPathContext(orderId, {
    bookId: order?.bookContext?.bookId ?? order?.project ?? DEFAULT_BOOK_ID,
    orderPrefix: order?.bookContext?.orderPrefix ?? order?.assetPrefix ?? null,
    pathLikes: [
      order?.manifest2aUrl,
      order?.manifest2bUrl,
      order?.manifest3Url,
      order?.finalBookUrl,
      order?.finalCoverUrl,
    ],
  });
  const bookId = orderPathContext.bookId;
  const orderPrefix = orderPathContext.orderPrefix;
  const manifestContext = { bookId, orderPrefix };

  // Update state when R2 assets change - use ref to track previous key and prevent infinite loops
  // Archived orders can still surface background-removed images under r2Assets.poses.
  const posesBgRemoved = getPostBriaPoseAssets(order?.r2Assets);
  const prevKeyRef = useRef<string>('');
  // Track poses that the user has manually unflagged (persist across re-renders)
  const manuallyUnflaggedRef = useRef<Set<string>>(new Set());
  // Track poses that the user has manually flagged (persist across re-renders)
  const manuallyFlaggedRef = useRef<Set<string>>(new Set());
  
  // Reset manually unflagged/flagged sets when order changes
  useEffect(() => {
    manuallyUnflaggedRef.current.clear();
    manuallyFlaggedRef.current.clear();
  }, [orderId]);

  // Load manifest directly to read flags (source of truth)
  // This ensures flags persist regardless of what order API returns
  // Try 2b manifest first, fallback to 2a if 2b doesn't exist
  useEffect(() => {
    const loadManifestFlags = async () => {
      try {
        // Try 2b manifest first (for postBria flags)
        let manifestKey = `${orderPrefix}/manifests/2b-manifest.json`;
        let manifestUrl = `/api/manifests/${manifestKey}?v=${Date.now()}`;
        
        let response = await fetch(manifestUrl, { cache: 'no-store' });
        let manifest: any = null;
        
        if (!response.ok) {
          // Fallback to 2a manifest (for manually uploaded images)
          console.log('[PostBriaStage] 2b manifest not found, trying 2a manifest...');
          manifestKey = `${orderPrefix}/manifests/2a-manifest.json`;
          manifestUrl = `/api/manifests/${manifestKey}?v=${Date.now()}`;
          response = await fetch(manifestUrl, { cache: 'no-store' });
        }
        
        if (!response.ok) {
          console.log('[PostBriaStage] Manifest not found for flags:', response.status);
          return;
        }

        manifest = await response.json();
        const entries = manifest?.entries || [];
        
        // Clear and repopulate manuallyFlaggedRef from manifest (source of truth)
        manuallyFlaggedRef.current.clear();
        
        entries.forEach((entry: any) => {
          const poseNumber = entry.poseNumber ?? 0;
          const poseId = `pose${String(poseNumber).padStart(2, '0')}-bg-removed`;
          
          // If entry is flagged in manifest, add to manuallyFlaggedRef
          if (entry.isFlagged || entry.needsReview) {
            // Only add if not explicitly unflagged by user
            if (!manuallyUnflaggedRef.current.has(poseId)) {
              manuallyFlaggedRef.current.add(poseId);
              console.log(`[PostBriaStage] Restored flag for ${poseId} from manifest (isFlagged=${entry.isFlagged}, needsReview=${entry.needsReview})`);
            }
          }
        });
        
        console.log(`[PostBriaStage] Loaded flags from manifest: ${manuallyFlaggedRef.current.size} flagged items:`, Array.from(manuallyFlaggedRef.current));
      } catch (error) {
        console.error('[PostBriaStage] Error loading manifest flags:', error);
      }
    };
    
    loadManifestFlags();
    
    // Poll for flag changes every 3 seconds
    const interval = setInterval(loadManifestFlags, 3000);
    return () => clearInterval(interval);
  }, [orderId, orderPrefix]);
  
  useEffect(() => {
    // Calculate stable key from actual data - include isFlagged and needsReview to detect flag changes
    // Also include a timestamp from the URL's cache-busting parameter to detect replacements
    const currentKey = JSON.stringify({
      updatedAt: order?.updatedAt || '',
      bustToken: getBustToken(),
      poses: posesBgRemoved.map(p => {
        // Extract cache-busting timestamp from URL if present
        const urlTimestamp = p.url?.match(/[?&]v=(\d+)/)?.[1] || '';
        return {
          poseNumber: p.poseNumber,
          url: p.url,
          urlTimestamp: urlTimestamp, // Include timestamp to detect URL changes
          isMissing: p.isMissing,
          isFlagged: p.isFlagged,
          needsReview: p.needsReview,
          pageNumber: p.pageNumber,
          comparisonImageUrl: p.comparisonImageUrl,
        };
      })
    });
    
    // Only update if the key actually changed
    if (currentKey === prevKeyRef.current) {
      return;
    }
    
    prevKeyRef.current = currentKey;
    
    if (posesBgRemoved.length > 0) {
      const bust = getBustToken();
      const mappedPoses = posesBgRemoved.map((pose) => {
        const poseNumber = pose.poseNumber ?? 0;
        const poseId = `pose${String(poseNumber).padStart(2, '0')}-bg-removed`;
        const isMissing = pose.isMissing || !pose.url;
        
        // Check if user has manually unflagged or flagged this pose - respect those decisions
        const isManuallyUnflagged = manuallyUnflaggedRef.current.has(poseId);
        const isManuallyFlagged = manuallyFlaggedRef.current.has(poseId);
        
        // Set isFlagged based on manual flags, manifest flags, needsReview, or isMissing
        // Priority: manually flagged > missing > manually unflagged > manifest flags
        const shouldBeFlagged = isManuallyFlagged || isMissing || (!isManuallyUnflagged && (pose.isFlagged || pose.needsReview));
        const pageNumber =
          typeof pose.pageNumber === 'number' && Number.isFinite(pose.pageNumber)
            ? pose.pageNumber
            : null;
        const comparisonImageUrl =
          typeof pose.comparisonImageUrl === 'string' && pose.comparisonImageUrl.trim().length > 0
            ? withCacheBust(pose.comparisonImageUrl, bust)
            : null;
        
        return {
          id: poseId,
          name: `Pose ${poseNumber} (BG Removed)${isMissing ? ' (Missing)' : ''}`,
          url: withCacheBust(pose.url || '', bust),
          isFlagged: shouldBeFlagged, // Respect user unflag decisions
          hasTransparentBackground: true,
          isMissing: isMissing,
          status: pose.status,
          reviewReason: pose.reviewReason,
          attempts: pose.attempts,
          // Comparison mode data for Post-Bria
          comparisonMode: comparisonImageUrl ? 'background' as const : null,
          comparisonImageUrl: comparisonImageUrl ?? undefined,
          comparisonLabel: pose.comparisonLabel || 'Page Background',
          poseNumber: poseNumber,
          pageNumber: pageNumber ?? undefined,
          // Flip handler - pass the (cache-busted) URL directly to avoid stale closure issues
          onFlip: () => handleFlip(poseId, poseNumber, withCacheBust(pose.url || '', bust)),
          isFlipping: flippingPoseId === poseId
        };
      });

      setPoses(mappedPoses);
    } else {
      // Reset poses if no R2 data
      setPoses([]);
    }
  }, [posesBgRemoved, orderId, flippingPoseId, bustCounter]);

  const handleFlip = async (assetId: string, poseNumber: number, imageUrlParam?: string) => {
    console.log('[PostBriaStage] handleFlip called with assetId:', assetId, 'poseNumber:', poseNumber, 'imageUrlParam:', imageUrlParam);
    
    setFlippingPoseId(assetId);
    
    try {
      // Use the URL passed as parameter, or try to find it from current poses state
      let imageUrl: string | undefined = imageUrlParam;
      
      if (!imageUrl || imageUrl.trim() === '') {
        // Fallback: try to find from current poses state
        let currentPose = poses.find(p => p.poseNumber === poseNumber);
        if (!currentPose) {
          // Fallback: try finding by assetId
          currentPose = poses.find(p => p.id === assetId);
        }
        
        if (!currentPose || !currentPose.url || currentPose.url.trim() === '') {
          // Last resort: fetch from API
          console.log('[PostBriaStage] URL not provided and not found in state, fetching from API...');
          const orderResponse = await fetch(`/api/orders/${orderId}`);
          if (!orderResponse.ok) {
            throw new Error('Failed to fetch order data');
          }
          const orderData = await orderResponse.json();
          const apiPose = getPostBriaPoseAssets(orderData.r2Assets).find((p: any) => p.poseNumber === poseNumber);
          if (!apiPose || !apiPose.url) {
            alert(`Image URL is missing for pose ${poseNumber}. The image may not have been generated yet.`);
            setFlippingPoseId(null);
            return;
          }
          imageUrl = apiPose.url;
        } else {
          imageUrl = currentPose.url;
        }
      }

      // At this point, imageUrl should be defined, but TypeScript doesn't know that
      if (!imageUrl || imageUrl.trim() === '') {
        alert(`Image URL is missing for pose ${poseNumber}. The image may not have been generated yet.`);
        setFlippingPoseId(null);
        return;
      }

      // TypeScript assertion: imageUrl is guaranteed to be a string at this point
      let finalImageUrl: string = imageUrl;

      // Check if URL is a data URL (from previous flip) - if so, we need to fetch the original from R2
      if (finalImageUrl.startsWith('data:')) {
        // Data URL from previous flip - we need to get the original image from the API
        console.log('[PostBriaStage] URL is a data URL, fetching original from API');
        // Fetch the original image URL from the order data
        const orderResponse = await fetch(`/api/orders/${orderId}`);
        if (!orderResponse.ok) {
          throw new Error('Failed to fetch order data');
        }
        const orderData = await orderResponse.json();
        const originalPose = getPostBriaPoseAssets(orderData.r2Assets).find((p: any) => p.poseNumber === poseNumber);
        if (!originalPose || !originalPose.url) {
          throw new Error('Original image URL not found in order data');
        }
        finalImageUrl = originalPose.url;
        console.log('[PostBriaStage] Using original URL:', finalImageUrl);
      }

      // Ensure URL is absolute if it's a relative path
      if (finalImageUrl.startsWith('/')) {
        finalImageUrl = window.location.origin + finalImageUrl;
      }

      // Load the image - try Image element first, fallback to fetch if CORS fails
      let img: HTMLImageElement;
      let imageBlob: Blob | null = null;
      
      try {
        // First, try loading via Image element (faster, works if CORS is configured)
        img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Image load timeout'));
          }, 10000); // 10 second timeout for Image element
          
          img.onload = () => {
            clearTimeout(timeout);
            resolve(null);
          };
          img.onerror = (error) => {
            clearTimeout(timeout);
            console.warn('[PostBriaStage] Image element load failed, will try fetch:', error);
            reject(new Error('Image element failed'));
          };
          img.src = finalImageUrl;
        });
      } catch (imageError) {
        // Fallback: fetch the image as a blob and create Image from blob URL
        console.log('[PostBriaStage] Image element failed, trying fetch API...');
        try {
          const response = await fetch(finalImageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          imageBlob = await response.blob();
          const blobUrl = URL.createObjectURL(imageBlob);
          
          // Create new Image from blob URL
          img = new Image();
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Image load from blob timeout'));
            }, 10000);
            
            img.onload = () => {
              clearTimeout(timeout);
              resolve(null);
            };
            img.onerror = (error) => {
              clearTimeout(timeout);
              URL.revokeObjectURL(blobUrl); // Clean up
              reject(new Error('Failed to load image from blob'));
            };
            img.src = blobUrl;
          });
          
          // Clean up blob URL after loading (will be revoked after canvas operations)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (fetchError: any) {
          console.error('[PostBriaStage] Both Image element and fetch failed:', fetchError);
          throw new Error(`Failed to load image: ${fetchError.message || 'Unknown error'}. URL: ${imageUrl}`);
        }
      }

      // Create canvas and flip the image horizontally
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Flip horizontally by scaling and translating
      ctx.scale(-1, 1);
      ctx.drawImage(img, -img.width, 0);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/png');
      });

      // Create FormData and upload the flipped image (replaces original - no flip state needed)
      const formData = new FormData();
      formData.append('poseNumber', poseNumber.toString());
      formData.append('stage', 'postBria'); // Post-Bria stage - replaces original bg-removed image
      formData.append('file', blob, `pose${String(poseNumber).padStart(2, '0')}-nobg.png`);

      const response = await fetch(`/api/orders/${orderId}/replace-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Failed to upload flipped image';
        try {
          const errorBody = await response.json();
          errorMessage = extractApiErrorMessage(errorBody, errorMessage);
          console.error('[PostBriaStage] API error response:', errorBody);
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        alert(errorMessage);
        setFlippingPoseId(null);
        return;
      }

      const result = await response.json();
      console.log('[PostBriaStage] Flip and upload successful:', result);

      // Create a data URL from the flipped canvas for immediate display
      const flippedDataUrl = canvas.toDataURL('image/png');
      
      // Update the local state immediately to show the flipped image
      setPoses(prev => prev.map(pose => {
        if (pose.id === assetId) {
          // Use data URL for immediate visual feedback, then refresh will get the R2 version
          return {
            ...pose,
            url: flippedDataUrl,
            _isFlipped: true // Flag to indicate this is a temporary flipped version
          };
        }
        return pose;
      }));

      // Refresh the order data to get the updated image from R2
      if (onRefresh) {
        await onRefresh();
      }
      bumpBust();
    } catch (error: any) {
      console.error('[PostBriaStage] Error flipping image:', error);
      alert(`Failed to flip image: ${error.message || 'Unknown error'}`);
    } finally {
      setFlippingPoseId(null);
    }
  };

  const handleFixTransparency = async (
    poseNumber: number,
    options: {
      fixEyes: boolean;
      fixTeeth: boolean;
      eyes?: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number }; radius?: number; leftRadius?: number; rightRadius?: number };
      teeth?: { center: { x: number; y: number }; rx: number; ry: number };
    }
  ) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fix-eye-transparency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poseNumber,
          fixEyes: options.fixEyes,
          fixTeeth: options.fixTeeth,
          eyes: options.eyes,
          teeth: options.teeth,
        }),
      });

      const responseText = await res.text();
      let data: any = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const fallbackMessage = responseText.startsWith('<!DOCTYPE')
          ? `Fix transparency failed: ${res.status} ${res.statusText}`
          : (responseText || `Fix transparency failed: ${res.status} ${res.statusText}`);
        throw new Error(extractApiErrorMessage(data, fallbackMessage));
      }

      if (onRefresh) await onRefresh();
      bumpBust();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg);
    }
  };

  const handleDownload = async (assetId: string) => {
    try {
      // Find the asset URL
      const pose = poses.find(p => p.id === assetId);
      const assetUrl = pose?.url || null;

      if (!assetUrl) {
        console.error('Asset URL not found for:', assetId);
        alert('Asset not found');
        return;
      }

      // Trigger download by creating a temporary link
      const link = document.createElement('a');
      link.href = assetUrl;
      link.download = `${assetId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download asset');
    }
  };

  const handleReplace = async (assetId: string, file: File) => {
    console.log('[PostBriaStage] handleReplace called with assetId:', assetId, 'file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    console.log('[PostBriaStage] Setting isReplacing state to:', assetId);
    setIsReplacing(assetId);
    
    try {
      // Create form data
      console.log('[PostBriaStage] Creating FormData...');
      const formData = new FormData();
      formData.append('stage', 'postBria');
      formData.append('file', file);
      
      // Handle base character replacement
      if (assetId === 'base-character') {
        formData.append('isBaseCharacter', 'true');
        console.log('[PostBriaStage] Base character replacement requested');
      } else {
        // Extract pose number from assetId (e.g., "pose01" -> 1)
        const match = assetId.match(/pose(\d+)/);
        if (!match) {
          console.error('[PostBriaStage] Could not determine poseNumber for:', assetId);
          alert('Invalid asset ID');
          setIsReplacing(null);
          return;
        }

        const poseNumber = parseInt(match[1], 10);
        console.log('[PostBriaStage] Extracted poseNumber:', poseNumber);
        formData.append('poseNumber', poseNumber.toString());
      }
      
      console.log('[PostBriaStage] FormData created, file appended:', file.name);
      // replacedBy is optional - will be added when auth is implemented

      // Call API endpoint
      const apiUrl = `/api/orders/${orderId}/replace-image`;
      console.log('[PostBriaStage] Calling API:', apiUrl);
      console.log('[PostBriaStage] FormData entries:', {
        poseNumber: formData.get('poseNumber'),
        isBaseCharacter: formData.get('isBaseCharacter'),
        stage: formData.get('stage'),
        file: formData.get('file') ? 'present' : 'missing'
      });
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      console.log('[PostBriaStage] API response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Failed to replace image';
        try {
          const errorBody = await response.json();
          errorMessage = extractApiErrorMessage(errorBody, errorMessage);
          console.error('[PostBriaStage] API error response:', errorBody);
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
          console.error('[PostBriaStage] Failed to parse error response');
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[PostBriaStage] Image replaced successfully:', result);

      // Clear prevKeyRef to force useEffect to run even if URL structure is similar
      prevKeyRef.current = '';

      // Wait a moment for R2 upload to propagate and cache to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh the order data to show updated image
      if (onRefresh) {
        console.log('[PostBriaStage] Calling onRefresh...');
        await onRefresh();
        console.log('[PostBriaStage] onRefresh completed');
      } else {
        console.warn('[PostBriaStage] No onRefresh callback provided');
      }
      bumpBust();
    } catch (error: any) {
      console.error('[PostBriaStage] Replace failed with error:', error);
      console.error('[PostBriaStage] Error stack:', error.stack);
      alert(error.message || 'Failed to replace image');
    } finally {
      console.log('[PostBriaStage] Clearing isReplacing state');
      setIsReplacing(null);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      prevKeyRef.current = '';
      
      if (onRefresh) {
        await onRefresh();
        prevKeyRef.current = '';
      } else {
        window.location.reload();
      }
      bumpBust();
    } catch (error) {
      console.error('Error refreshing images:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFlag = async (assetId: string) => {
    setPoses(prev => {
      const currentPose = prev.find(p => p.id === assetId);
      if (!currentPose) return prev;
      
      const newFlaggedState = !currentPose.isFlagged;
      
      // Extract poseNumber from assetId (e.g., "pose05-bg-removed" -> 5)
      const poseNumberMatch = assetId.match(/pose(\d+)/);
      const poseNumber = poseNumberMatch ? parseInt(poseNumberMatch[1], 10) : null;
      
      // Persist flagging/unflagging to manifest via API
      if (poseNumber !== null) {
        const apiEndpoint = newFlaggedState ? `/api/orders/${orderId}/flag` : `/api/orders/${orderId}/unflag`;
        fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            poseNumber,
            stage: 'postBria',
            ...manifestContext,
          })
        }).then(async response => {
          if (!response.ok) {
            console.error(`[PostBriaStage] Failed to persist ${newFlaggedState ? 'flagging' : 'unflagging'}:`, response.statusText);
            // Revert the flag state if API call failed
            setPoses(prevPoses => prevPoses.map(pose => 
              pose.id === assetId ? { ...pose, isFlagged: !newFlaggedState } : pose
            ));
          } else {
            const result = await response.json();
            // Successfully persisted
            if (newFlaggedState) {
              // User is flagging - add to manually flagged set, remove from unflagged set
              manuallyFlaggedRef.current.add(assetId);
              manuallyUnflaggedRef.current.delete(assetId);
            } else {
              // User is unflagging - add to manually unflagged set, remove from flagged set
            manuallyUnflaggedRef.current.add(assetId);
              manuallyFlaggedRef.current.delete(assetId);
            }
            
            // Update flag count after successful API call
            const updatedPoses = prev.map(pose => 
              pose.id === assetId ? { ...pose, isFlagged: newFlaggedState } : pose
            );
            const newFlaggedCount = updatedPoses.filter(asset => asset.isFlagged).length;
            await setFlaggedCount(orderId, 'postBria', newFlaggedCount);
          }
        }).catch(error => {
          console.error(`[PostBriaStage] Error persisting ${newFlaggedState ? 'flagging' : 'unflagging'}:`, error);
          // Revert the flag state if API call failed
          setPoses(prevPoses => prevPoses.map(pose => 
            pose.id === assetId ? { ...pose, isFlagged: !newFlaggedState } : pose
          ));
        });
      }
      
      // Update local state immediately (optimistic update)
      const updated = prev.map(pose => 
        pose.id === assetId ? { ...pose, isFlagged: newFlaggedState } : pose
      );
      
      // Update flag count immediately (optimistic)
        const newFlaggedCount = updated.filter(asset => asset.isFlagged).length;
      setFlaggedCount(orderId, 'postBria', newFlaggedCount).catch(err => {
        console.error('[PostBriaStage] Failed to update flag count:', err);
      });
      
      return updated;
    });
  };

  const flaggedCount = poses.filter(asset => asset.isFlagged).length;
  const missingCount = poses.filter(pose => pose.isMissing || !pose.url).length;
  const hasImages = poses.length > 0 && poses.every(pose => pose.url && pose.url.length > 0 && !pose.isMissing);
  // Post‑Bria approval rule: if 2B populated images and none are flagged, allow approval
  const isPreBriaApproved = order.reviewStages.preBria.status === 'approved';
  const canApprove = flaggedCount === 0 && hasImages && missingCount === 0;
  const isApprovedEffective = approveStageConfirmed || isApproved;
  const canTriggerAssembly = isApprovedEffective && hasImages;

  const [isTriggering, setIsTriggering] = useState(false);
  const [isSyncing2bManifest, setIsSyncing2bManifest] = useState(false);

  const handleApproveStage = async () => {
    const targetStatus = approveStageConfirmed ? 'pending' : 'approved';
    try {
      await onApprove(targetStatus);
      setApproveStageConfirmed(targetStatus === 'approved');
      // Optional refresh to reflect server state
      if (onRefresh) {
        setTimeout(() => {
          handleRefresh();
        }, 250);
      }
    } catch (e) {
      console.error('Approve Post‑Bria failed', e);
      alert('Failed to approve stage');
    }
  };

  const handleTriggerBookAssembly = async () => {
    if (!canTriggerAssembly || isTriggering) return;
    setIsTriggering(true);
    try {
      // Queue order for workflow 3 via W1.1 router
      // This updates Supabase to mark the order as ready for workflow 3
      // W1.1 will pick it up on its next cycle (every 30 seconds)
      const resp = await fetch(`/api/orders/${orderId}/queue-workflow-3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('Queue workflow 3 failed', resp.status, txt);
        alert(`Failed to queue order for book assembly: ${resp.status} ${txt}`);
        return;
      }
      alert('Order queued for book assembly. W1.1 router will process it within 30 seconds.');
    } catch (e) {
      console.error('Queue workflow 3 error', e);
      alert('Error queueing order for book assembly');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSync2bManifest = async () => {
    if (isSyncing2bManifest) return;
    setIsSyncing2bManifest(true);
    try {
      const resp = await fetch(`/api/orders/${orderId}/sync-2b-manifest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      let payload: any = null;
      try {
        payload = await resp.json();
      } catch {
        payload = null;
      }

      if (!resp.ok) {
        const err = payload?.error || `HTTP ${resp.status}`;
        const details = payload?.details ? `\n\n${payload.details}` : '';
        alert(`2B manifest sync failed: ${err}${details}`);
        return;
      }

      const updated = Array.isArray(payload?.updatedPoseNumbers) ? payload.updatedPoseNumbers : [];
      const missing = Array.isArray(payload?.stillMissingPoseNumbers) ? payload.stillMissingPoseNumbers : [];

      if (updated.length === 0 && missing.length === 0) {
        alert('2B manifest sync complete. No changes were needed.');
      } else if (updated.length > 0 && missing.length === 0) {
        alert(`2B manifest sync complete. Updated poses: ${updated.join(', ')}`);
      } else if (updated.length === 0 && missing.length > 0) {
        alert(
          `2B manifest sync ran, but some poses are still missing bg-removed assets in R2: ${missing.join(', ')}`
        );
      } else {
        alert(
          `2B manifest sync complete.\n\nUpdated poses: ${updated.join(', ')}\nMissing in R2: ${missing.join(', ')}`
        );
      }

      // Refresh order data to pick up updated manifest fields/caches
      if (onRefresh) {
        await onRefresh();
      }
    } catch (e: any) {
      console.error('2B manifest sync error', e);
      alert('Error syncing 2B manifest');
    } finally {
      setIsSyncing2bManifest(false);
    }
  };

  // Un-confirm approval when flags are set (same as Pre-Bria)
  useEffect(() => {
    setFlaggedCount(orderId, 'postBria', flaggedCount);
    
    // If any asset is flagged, un-confirm approval
    if (flaggedCount > 0) {
      setApproveStageConfirmed(false);
    }
  }, [orderId, flaggedCount]);

  // Check if images are shared with other orders
  const sharedImageInfo:
    | { isShared?: boolean; sourceOrderIds?: string[] }
    | null = ((order as any)?.r2Assets?.sharedImageInfo as any) ?? null;
  const isImagesShared = sharedImageInfo?.isShared === true;
  const sourceOrderIds: string[] = sharedImageInfo?.sourceOrderIds ?? [];

  return (
    <div className="space-y-8">
      {/* Shared Images Indicator */}
      {isImagesShared && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-amber-900 mb-1">
                Images Shared with Other Orders
              </h4>
              <p className="text-sm text-amber-800 mb-2">
                These images are being reused from {sourceOrderIds.length === 1 ? 'another order' : `${sourceOrderIds.length} other orders`} with identical character specifications. 
                This is expected behavior and helps save generation costs.
              </p>
              {sourceOrderIds.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-amber-900 mb-1">Source order{sourceOrderIds.length > 1 ? 's' : ''}:</p>
                  <div className="flex flex-wrap gap-2">
                    {sourceOrderIds.slice(0, 5).map((sourceOrderId: string) => (
                      <a
                        key={sourceOrderId}
                        href={`/orders/${sourceOrderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors"
                      >
                        {sourceOrderId}
                      </a>
                    ))}
                    {sourceOrderIds.length > 5 && (
                      <span className="text-xs text-amber-700 px-2 py-1">
                        +{sourceOrderIds.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Background Toggle and Refresh */}
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-blue-900">Background Preview</h4>
            <p className="text-sm text-blue-700 mt-1">
              Toggle black background to check for missed white edges or artifacts
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh images from R2 storage"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Images'}
            </button>
            <button
              onClick={() => setShowBlackBackground(!showBlackBackground)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                showBlackBackground
                  ? 'bg-black text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {showBlackBackground ? 'Hide' : 'Show'} Black Background
            </button>
          </div>
        </div>
      </div>

      {/* Poses Section */}
      {poses.length > 0 ? (
        <AssetGrid
          title="Character Poses (Background Removed)"
          description="All poses with transparent backgrounds - review for clean edges and artifacts"
          assets={poses}
          onDownload={handleDownload}
          onReplace={handleReplace}
          onFlag={handleFlag}
          onApprove={() => {}}
          canApprove={true}
          isApproved={isApproved}
          showBlackBackground={showBlackBackground}
          isReplacing={isReplacing}
          orderId={orderId}
          showFixTransparency={true}
          onFixTransparency={handleFixTransparency}
        />
      ) : (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Images Found</h3>
          <p className="text-gray-600 mb-4">
            Background-removed images have not been generated yet. This typically happens when:
          </p>
          <ul className="text-sm text-gray-500 text-left max-w-md mx-auto space-y-1">
            <li>• The Pre-Bria stage hasn't been completed yet</li>
            <li>• The Bria background removal process is still running</li>
            <li>• There was an error during the background removal process</li>
          </ul>
          <div className="mt-6">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Page
            </button>
          </div>
        </div>
      )}

      {/* Quality Check Tips */}
      <div className="bg-yellow-50 rounded-lg p-6">
        <h4 className="text-sm font-medium text-yellow-900 mb-3">Quality Check Tips</h4>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• Use the black background toggle to spot white edges or artifacts</li>
          <li>• Look for jagged edges or incomplete background removal</li>
          <li>• Check for any remaining background elements or shadows</li>
          <li>• Ensure character details are preserved and not cut off</li>
          <li>• Flag any images that need manual cleanup</li>
        </ul>
      </div>

      {/* Stage Actions */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">Stage Actions</h4>
            <p className="text-sm text-gray-600 mt-1">
              {isApproved 
                ? 'This stage has been approved. You can now initiate the next workflow.'
                : !hasImages
                ? 'Background-removed images are not available yet. Please wait for the Bria process to complete before approving.'
                : flaggedCount > 0
                ? `Please address ${flaggedCount} flagged item${flaggedCount !== 1 ? 's' : ''} before approving.`
                : 'Review all assets and follow the workflow steps below.'
              }
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Approve Stage (always visible, mirrors first tab styles) */}
              <button
              onClick={() => handleApproveStage()}
              disabled={approveStageConfirmed ? false : !canApprove}
              className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${
                approveStageConfirmed
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 focus:ring-emerald-500'
                  : canApprove
                  ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 focus:ring-slate-500'
                  : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
              title={approveStageConfirmed ? 'Stage approved' : (canApprove ? 'Approve this stage' : 'Resolve issues to enable approval')}
              >
              <CheckCircle className="h-4 w-4 mr-2" />
              {approveStageConfirmed ? 'Stage Approved' : 'Approve Stage'}
              </button>

            {/* Trigger Book Assembly (replaces BG removal) */}
              <button
              onClick={handleTriggerBookAssembly}
              disabled={!canTriggerAssembly || isTriggering}
                className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                canTriggerAssembly && !isTriggering
                  ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              title={isApproved ? 'Queue order for Workflow 3 via W1.1 router' : 'Approve stage to enable book assembly'}
              >
              <Play className="h-4 w-4 mr-2" />
              {isTriggering ? 'Triggering…' : 'Trigger Book Assembly'}
              </button>

            {/* Sync/Repair 2B manifest from current R2 inventory */}
            <button
              onClick={handleSync2bManifest}
              disabled={isSyncing2bManifest}
              className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isSyncing2bManifest
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-blue-500'
              }`}
              title="Backfill missing bgRemovedKey fields in 2b-manifest.json using the current bg-removed images in R2"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing2bManifest ? 'animate-spin' : ''}`} />
              {isSyncing2bManifest ? 'Syncing…' : 'Sync 2B Manifest'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
