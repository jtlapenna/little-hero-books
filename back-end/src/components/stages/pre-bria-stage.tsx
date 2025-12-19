'use client';

import { useEffect, useState, useRef } from 'react';
import { AssetGrid } from '@/components/assets/asset-grid';
import { CheckCircle, Play, X, Info } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';

interface PreBriaStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: (nextStatus: 'approved' | 'pending') => void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
  onOrderUpdate?: (updates: Partial<Order>) => void;
}

export function PreBriaStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow, onRefresh, onOrderUpdate }: PreBriaStageProps) {
  // Initialize with empty state - will be populated from R2 data
  const [baseCharacter, setBaseCharacter] = useState({
    id: 'base-character',
    name: 'Base Character',
    url: '',
    isFlagged: false,
    hasTransparentBackground: false
  });

  const [poses, setPoses] = useState<Array<{ id: string; name: string; url: string; isFlagged: boolean; hasTransparentBackground: boolean; isMissing?: boolean; status?: string; reviewReason?: string; attempts?: number; comparisonMode?: 'reference' | 'background' | null; comparisonImageUrl?: string; comparisonLabel?: string; poseNumber?: number; pendingRevisionUrl?: string; onRevisionBadgeClick?: () => void; onFlip?: () => void; isFlipping?: boolean }>>([]);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);
  const [flippingPoseId, setFlippingPoseId] = useState<string | null>(null);
  const [pendingRevisions, setPendingRevisions] = useState<Record<string, { r2Key: string; previewUrl: string }>>({});
  
  // Track poses that the user has manually unflagged (persist across re-renders)
  const manuallyUnflaggedRef = useRef<Set<string>>(new Set());
  // Track poses that the user has manually flagged (persist across re-renders)
  const manuallyFlaggedRef = useRef<Set<string>>(new Set());
  // Track active polling intervals for cleanup
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Track if an operation is in progress to prevent race conditions
  const operationInProgressRef = useRef<Set<string>>(new Set());
  
  // Reset manually unflagged/flagged sets when order changes
  useEffect(() => {
    manuallyUnflaggedRef.current.clear();
    manuallyFlaggedRef.current.clear();
    operationInProgressRef.current.clear();
  }, [orderId]);

  // Cleanup polling intervals on unmount or order change
  useEffect(() => {
    return () => {
      // Clear all polling intervals
      pollingIntervalsRef.current.forEach((interval) => {
        clearInterval(interval);
      });
      pollingIntervalsRef.current.clear();
      
      // Clear all polling timeouts
      pollingTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      pollingTimeoutsRef.current.clear();
    };
  }, [orderId]);

  // Load manifest directly to read flags (source of truth)
  // This ensures flags persist regardless of what order API returns
  useEffect(() => {
    const loadManifestFlags = async () => {
      try {
        const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
        const manifestUrl = `/api/manifests/${manifestKey}?v=${Date.now()}`;
        
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) {
          console.log('[PreBriaStage] Manifest not found for flags:', response.status);
          return;
        }

        const manifest = await response.json();
        const entries = manifest?.entries || [];
        
        // Clear and repopulate manuallyFlaggedRef from manifest (source of truth)
        manuallyFlaggedRef.current.clear();
        
        entries.forEach((entry: any) => {
          const poseNumber = entry.poseNumber ?? 0;
          const poseId = `pose${String(poseNumber).padStart(2, '0')}`;
          
          // If entry is flagged in manifest, add to manuallyFlaggedRef
          if (entry.isFlagged || entry.needsReview) {
            // Only add if not explicitly unflagged by user
            if (!manuallyUnflaggedRef.current.has(poseId)) {
              manuallyFlaggedRef.current.add(poseId);
              console.log(`[PreBriaStage] Restored flag for ${poseId} from manifest (isFlagged=${entry.isFlagged}, needsReview=${entry.needsReview})`);
            }
          }
        });
        
        console.log(`[PreBriaStage] Loaded flags from manifest: ${manuallyFlaggedRef.current.size} flagged items:`, Array.from(manuallyFlaggedRef.current));
      } catch (error) {
        console.error('[PreBriaStage] Error loading manifest flags:', error);
      }
    };
    
    if (orderId) {
      loadManifestFlags();
      
      // Poll for flag changes every 3 seconds
      const interval = setInterval(loadManifestFlags, 3000);
      return () => clearInterval(interval);
    }
  }, [orderId]);

  // Load pending revisions from manifest
  useEffect(() => {
    const loadPendingRevisions = async () => {
      try {
        const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
        const manifestUrl = `/api/manifests/${manifestKey}?v=${Date.now()}`;
        
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) {
          console.log('[PreBriaStage] Manifest not found or error loading:', response.status);
          // Only clear if no operations are in progress
          if (operationInProgressRef.current.size === 0) {
            setPendingRevisions({});
          }
          return;
        }

        const manifest = await response.json();
        const revisions = manifest?.revisions?.pending || {};
        
        // Map pending revisions to pose keys (pose01, pose02, etc.)
        const revisionsMap: Record<string, { r2Key: string; previewUrl: string }> = {};
        Object.keys(revisions).forEach((poseKey) => {
          const revision = revisions[poseKey];
          if (revision?.r2Key && revision?.status === 'completed') {
            // Prefer Cloudflare Images URL if available, otherwise use R2 URL
            const previewUrl = revision.cloudflareImageUrl || `/api/assets/${revision.r2Key}`;
            revisionsMap[poseKey] = {
              r2Key: revision.r2Key,
              previewUrl
            };
          }
        });

        console.log('[PreBriaStage] Loaded pending revisions:', Object.keys(revisionsMap));
        
        // Only update state if no operations are in progress for these poses
        setPendingRevisions(prev => {
          const updated = { ...prev };
          Object.keys(revisionsMap).forEach(poseKey => {
            // Don't overwrite if an operation is in progress for this pose
            if (!operationInProgressRef.current.has(poseKey)) {
              updated[poseKey] = revisionsMap[poseKey];
            }
          });
          // Remove poses that are no longer in manifest (unless operation in progress)
          Object.keys(updated).forEach(poseKey => {
            if (!revisionsMap[poseKey] && !operationInProgressRef.current.has(poseKey)) {
              delete updated[poseKey];
            }
          });
          return updated;
        });
      } catch (error) {
        console.error('[PreBriaStage] Error loading pending revisions:', error);
        // Only clear if no operations are in progress
        if (operationInProgressRef.current.size === 0) {
          setPendingRevisions({});
        }
      }
    };

    if (orderId) {
      loadPendingRevisions();
      
      // Periodically refresh pending revisions (every 10 seconds) to detect new completions
      const refreshInterval = setInterval(() => {
        loadPendingRevisions();
      }, 10000);
      
      return () => {
        clearInterval(refreshInterval);
      };
    }
  }, [orderId]);

  // Two-step workflow state
  const [approveStageConfirmed, setApproveStageConfirmed] = useState(!!isApproved);
  const [triggerBackgroundRemovalConfirmed, setTriggerBackgroundRemovalConfirmed] = useState(false);

  useEffect(() => {
    setApproveStageConfirmed(!!isApproved);
    if (!isApproved) {
      setTriggerBackgroundRemovalConfirmed(false);
    }
  }, [isApproved]);

  // Update state when R2 assets change - use JSON stringify for stable comparison
  // This prevents infinite loops when order object reference changes but data is the same
  const r2Assets = order?.r2Assets;
  const r2AssetsKey = r2Assets ? JSON.stringify({
    baseCharacterUrl: r2Assets.baseCharacter?.url || '',
    posesCount: r2Assets.poses?.length || 0,
    poses: r2Assets.poses?.map(p => ({ poseNumber: p.poseNumber, url: p.url, isMissing: p.isMissing, isFlagged: p.isFlagged, needsReview: p.needsReview })) || []
  }) : '';
  
  useEffect(() => {
    console.log('[PreBriaStage] useEffect triggered, r2AssetsKey length:', r2AssetsKey?.length);
    if (!r2Assets) {
      console.log('[PreBriaStage] No r2Assets, returning early');
      return;
    }
    
    console.log('[PreBriaStage] Processing r2Assets, poses count:', r2Assets.poses?.length);
    
    // Update base character if available
    if (r2Assets.baseCharacter && r2Assets.baseCharacter.url) {
      console.log('[PreBriaStage] Setting base character:', r2Assets.baseCharacter.url.substring(0, 60));
      setBaseCharacter({
        id: 'base-character',
        name: 'Base Character',
        url: r2Assets.baseCharacter.url,
        isFlagged: false,
        hasTransparentBackground: false
      });
    } else {
      console.log('[PreBriaStage] No base character URL, resetting');
      // Reset base character if no R2 data
      setBaseCharacter({
        id: 'base-character',
        name: 'Base Character',
        url: '',
        isFlagged: false,
        hasTransparentBackground: false
      });
    }

    // Update poses if available - use actual poseNumber from data to support any number of poses (including pose0)
    // Include missing/exhausted poses as placeholders
    // Note: Flags are now loaded directly from manifest in a separate useEffect, so we just use manuallyFlaggedRef here
    const posesData = r2Assets.poses || [];
    console.log('[PreBriaStage] posesData length:', posesData.length, 'sample:', posesData.slice(0, 2).map(p => ({ poseNumber: p.poseNumber, url: p.url?.substring(0, 50) })));
    if (posesData.length > 0) {
      
      const mappedPoses = posesData.map((pose, index) => {
        const poseNumber = pose.poseNumber ?? 0;
        // Base poseId for flag tracking (matches manifest format)
        const basePoseId = `pose${String(poseNumber).padStart(2, '0')}`;
        // Unique poseId for React keys (includes index to handle duplicate poseNumbers)
        // This ensures stable, unique IDs for React keys and prevents re-render issues
        const poseId = `${basePoseId}-${index}`;
        const isMissing = pose.isMissing || !pose.url;
        
        // Check if user has manually unflagged or flagged this pose - respect those decisions
        // Use basePoseId for flag lookups since that's what's stored in the refs
        const isManuallyUnflagged = manuallyUnflaggedRef.current.has(basePoseId);
        const isManuallyFlagged = manuallyFlaggedRef.current.has(basePoseId);
        
        // Set isFlagged based on manual flags, manifest flags, needsReview, or isMissing
        // Priority: manually flagged > missing > manually unflagged > manifest flags
        const shouldBeFlagged = isManuallyFlagged || isMissing || (!isManuallyUnflagged && (pose.isFlagged || pose.needsReview || false));
        
        // Build reference pose URL for comparison
        const paddedPoseNumber = String(poseNumber).padStart(2, '0');
        const referencePoseUrl = `/api/assets/book-mvp-simple-adventure/characters/poses/pose${paddedPoseNumber}.png`;
        
        // Check for pending revision
        const revisionKey = `pose${paddedPoseNumber}`;
        const pendingRevision = pendingRevisions[revisionKey];
        
        // Log when pending revision is found
        if (pendingRevision) {
          console.log('[PreBriaStage] Found pending revision for pose', poseNumber, {
            revisionKey,
            r2Key: pendingRevision.r2Key,
            previewUrl: pendingRevision.previewUrl,
          });
        }
        
        // Add cache-busting parameter to pendingRevisionUrl to ensure React detects changes
        // This is critical when a second revision overwrites the first with the same preview URL
        let pendingRevisionUrlWithCacheBust: string | undefined = undefined;
        if (pendingRevision?.previewUrl) {
          // Add R2 key as cache-buster to ensure uniqueness even if preview URL is the same
          // This ensures React detects when a new revision arrives with a different R2 key
          const separator = pendingRevision.previewUrl.includes('?') ? '&' : '?';
          pendingRevisionUrlWithCacheBust = `${pendingRevision.previewUrl}${separator}r2Key=${encodeURIComponent(pendingRevision.r2Key)}&t=${Date.now()}`;
        }
        
        return {
          id: poseId,
          name: `Pose ${poseNumber}${isMissing ? ' (Missing)' : ''}`,
          url: pose.url || '',
          isFlagged: shouldBeFlagged, // Respect user unflag decisions
          hasTransparentBackground: false,
          isMissing: isMissing,
          status: pose.status,
          reviewReason: pose.reviewReason,
          attempts: pose.attempts,
          // Comparison mode data for Pre-Bria
          comparisonMode: 'reference' as const,
          comparisonImageUrl: referencePoseUrl,
          comparisonLabel: 'Reference Pose',
          poseNumber: poseNumber,
          // Revision data - use cache-busted URL to ensure React detects changes
          pendingRevisionUrl: pendingRevisionUrlWithCacheBust,
          onRevisionBadgeClick: pendingRevision ? () => {
            // Open modal with revision shown in reference area
            // Find the pose asset and open it in the modal
            // The modal will detect pendingRevisionUrl and show it appropriately
            console.log('[PreBriaStage] Revision badge clicked for pose', poseNumber);
            // Note: The actual modal opening is handled by AssetGrid when the badge is clicked
            // We just need to ensure the asset has the pendingRevisionUrl set (which it does)
          } : undefined,
          // Flip handler - pass the URL directly to avoid stale closure issues
          onFlip: () => handleFlip(poseId, poseNumber, pose.url || ''),
          isFlipping: flippingPoseId === poseId
        };
      });
      console.log('[PreBriaStage] Mapped poses count:', mappedPoses.length, 'sample:', mappedPoses.slice(0, 2).map(p => ({ id: p.id, url: p.url?.substring(0, 50) })));
      setPoses(mappedPoses);
    } else {
      console.log('[PreBriaStage] No poses data, resetting poses array');
      // Reset poses if no R2 data
      setPoses([]);
    }
  }, [r2AssetsKey, orderId, pendingRevisions, flippingPoseId]); // Include flippingPoseId to update isFlipping state

  const handleFlip = async (assetId: string, poseNumber: number, imageUrlParam?: string) => {
    console.log('[PreBriaStage] handleFlip called with assetId:', assetId, 'poseNumber:', poseNumber, 'imageUrlParam:', imageUrlParam);
    
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
          console.log('[PreBriaStage] URL not provided and not found in state, fetching from API...');
          const orderResponse = await fetch(`/api/orders/${orderId}`);
          if (!orderResponse.ok) {
            throw new Error('Failed to fetch order data');
          }
          const orderData = await orderResponse.json();
          const apiPose = orderData.r2Assets?.poses?.find((p: any) => p.poseNumber === poseNumber);
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
        console.log('[PreBriaStage] URL is a data URL, fetching original from API');
        // Fetch the original image URL from the order data
        const orderResponse = await fetch(`/api/orders/${orderId}`);
        if (!orderResponse.ok) {
          throw new Error('Failed to fetch order data');
        }
        const orderData = await orderResponse.json();
        const originalPose = orderData.r2Assets?.poses?.find((p: any) => p.poseNumber === poseNumber);
        if (!originalPose || !originalPose.url) {
          throw new Error('Original image URL not found in order data');
        }
        finalImageUrl = originalPose.url;
        console.log('[PreBriaStage] Using original URL:', finalImageUrl);
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
            console.warn('[PreBriaStage] Image element load failed, will try fetch:', error);
            reject(new Error('Image element failed'));
          };
          img.src = finalImageUrl;
        });
      } catch (imageError) {
        // Fallback: fetch the image as a blob and create Image from blob URL
        console.log('[PreBriaStage] Image element failed, trying fetch API...');
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
          console.error('[PreBriaStage] Both Image element and fetch failed:', fetchError);
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
      formData.append('stage', 'preBria'); // Pre-Bria stage - replaces original generated image
      formData.append('file', blob, `pose${String(poseNumber).padStart(2, '0')}.png`);

      const response = await fetch(`/api/orders/${orderId}/replace-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Failed to upload flipped image';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
          console.error('[PreBriaStage] API error response:', error);
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        alert(errorMessage);
        setFlippingPoseId(null);
        return;
      }

      const result = await response.json();
      console.log('[PreBriaStage] Flip and upload successful:', result);

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
    } catch (error: any) {
      console.error('[PreBriaStage] Error flipping image:', error);
      alert(`Failed to flip image: ${error.message || 'Unknown error'}`);
    } finally {
      setFlippingPoseId(null);
    }
  };

  const handleDownload = async (assetId: string) => {
    try {
      // Find the asset URL
      let assetUrl: string | null = null;
      if (assetId === 'base-character') {
        assetUrl = baseCharacter.url;
      } else {
        const pose = poses.find(p => p.id === assetId);
        assetUrl = pose?.url || null;
      }

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
    console.log('[PreBriaStage] handleReplace called with assetId:', assetId, 'file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    console.log('[PreBriaStage] Setting isReplacing state to:', assetId);
    setIsReplacing(assetId);
    
    try {
      // Create form data
      console.log('[PreBriaStage] Creating FormData...');
      const formData = new FormData();
      formData.append('stage', 'preBria');
      formData.append('file', file);
      
      // Handle base character replacement
      if (assetId === 'base-character') {
        formData.append('isBaseCharacter', 'true');
        console.log('[PreBriaStage] Base character replacement requested');
      } else {
        // Extract pose number from assetId (e.g., "pose01" -> 1)
        const match = assetId.match(/pose(\d+)/);
        if (!match) {
          console.error('[PreBriaStage] Could not determine poseNumber for:', assetId);
          alert('Invalid asset ID');
          setIsReplacing(null);
          return;
        }

        const poseNumber = parseInt(match[1], 10);
        console.log('[PreBriaStage] Extracted poseNumber:', poseNumber);
        formData.append('poseNumber', poseNumber.toString());
      }
      
      console.log('[PreBriaStage] FormData created, file appended:', file.name);
      // replacedBy is optional - will be added when auth is implemented

      // Call API endpoint
      const apiUrl = `/api/orders/${orderId}/replace-image`;
      console.log('[PreBriaStage] Calling API:', apiUrl);
      console.log('[PreBriaStage] FormData entries:', {
        poseNumber: formData.get('poseNumber'),
        isBaseCharacter: formData.get('isBaseCharacter'),
        stage: formData.get('stage'),
        file: formData.get('file') ? 'present' : 'missing'
      });
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      console.log('[PreBriaStage] API response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Failed to replace image';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
          console.error('[PreBriaStage] API error response:', error);
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
          console.error('[PreBriaStage] Failed to parse error response');
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[PreBriaStage] Image replaced successfully:', result);

      // Refresh the order data to show updated image
      if (onRefresh) {
        console.log('[PreBriaStage] Calling onRefresh...');
        await onRefresh();
        console.log('[PreBriaStage] onRefresh completed');
      } else {
        console.warn('[PreBriaStage] No onRefresh callback provided');
      }
    } catch (error: any) {
      console.error('[PreBriaStage] Replace failed with error:', error);
      console.error('[PreBriaStage] Error stack:', error.stack);
      alert(error.message || 'Failed to replace image');
    } finally {
      console.log('[PreBriaStage] Clearing isReplacing state');
      setIsReplacing(null);
    }
  };

  const handleFlag = async (assetId: string) => {
    if (assetId === 'base-character') {
      // Base character flagging - update local state and persist
      const newFlaggedState = !baseCharacter.isFlagged;
      setBaseCharacter(prev => ({ ...prev, isFlagged: newFlaggedState }));
      
      // Update flag count immediately
      const allAssets = [{ ...baseCharacter, isFlagged: newFlaggedState }, ...poses];
          const newFlaggedCount = allAssets.filter(asset => asset.isFlagged).length;
      await setFlaggedCount(orderId, 'preBria', newFlaggedCount);
    } else {
      setPoses(prev => {
        const currentPose = prev.find(p => p.id === assetId);
        if (!currentPose) return prev;
        
        const newFlaggedState = !currentPose.isFlagged;
        
        // Extract poseNumber from assetId (e.g., "pose05-0" -> 5, "pose05" -> 5)
        // Handle both old format (pose05) and new format (pose05-0)
        const basePoseId = assetId.includes('-') ? assetId.split('-').slice(0, -1).join('-') : assetId;
        const poseNumberMatch = basePoseId.match(/pose(\d+)/);
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
              stage: 'preBria'
            })
          }).then(async response => {
            if (!response.ok) {
              console.error(`[PreBriaStage] Failed to persist ${newFlaggedState ? 'flagging' : 'unflagging'}:`, response.statusText);
              // Revert the flag state if API call failed
              setPoses(prevPoses => prevPoses.map(pose => 
                pose.id === assetId ? { ...pose, isFlagged: !newFlaggedState } : pose
              ));
            } else {
              const result = await response.json();
              // Successfully persisted
              // Extract basePoseId from assetId (remove index suffix if present)
              // assetId format: "pose00-0" or "pose00-1", basePoseId: "pose00"
              const basePoseId = assetId.includes('-') ? assetId.split('-').slice(0, -1).join('-') : assetId;
              
              if (newFlaggedState) {
                // User is flagging - add to manually flagged set, remove from unflagged set
                manuallyFlaggedRef.current.add(basePoseId);
                manuallyUnflaggedRef.current.delete(basePoseId);
              } else {
                // User is unflagging - add to manually unflagged set, remove from flagged set
                manuallyUnflaggedRef.current.add(basePoseId);
                manuallyFlaggedRef.current.delete(basePoseId);
              }
              
              // Update order flags and review stages from API response
              if (onOrderUpdate) {
                const updates: any = {};
                if (result.flags) {
                  updates.flags = result.flags;
                }
                if (result.reviewStages) {
                  updates.reviewStages = result.reviewStages;
                }
                if (Object.keys(updates).length > 0) {
                  onOrderUpdate(updates);
                }
              }
            }
          }).catch(error => {
            console.error(`[PreBriaStage] Error persisting ${newFlaggedState ? 'flagging' : 'unflagging'}:`, error);
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
        
        // Optimistic flag count update (will be synced from API response)
        // No need to call setFlaggedCount - API response will update order.flags
        
        return updated;
      });
    }
  };

  const allAssets = [baseCharacter, ...poses];
  const flaggedCount = allAssets.filter(asset => asset.isFlagged).length;
  const missingCount = poses.filter(pose => pose.isMissing || !pose.url).length;
  
  // Check that we have some images to display (even if some are missing/placeholders)
  const baseCharacterExists = baseCharacter.url && baseCharacter.url.length > 0;
  const hasSomePoses = poses.length > 0;
  const hasAllImages = baseCharacterExists && hasSomePoses; // Changed: allow rendering even if some poses are missing (they'll show as placeholders)
  
  // Separate check for whether ALL poses exist (for approval logic)
  const allPosesExist = poses.length > 0 && poses.every(pose => pose.url && pose.url.length > 0 && !pose.isMissing);
  
  // Can approve stage only if all images exist, none are missing, and none are flagged
  const canApproveStage = flaggedCount === 0 && baseCharacterExists && allPosesExist && missingCount === 0;
  
  // Can trigger background removal if approve stage is confirmed
  const canTriggerBackgroundRemoval = approveStageConfirmed && canApproveStage;

  // Un-confirm stages when flags are set
  useEffect(() => {
    setFlaggedCount(orderId, 'preBria', flaggedCount);
    
    // If any asset is flagged, un-confirm all stages
    if (flaggedCount > 0) {
      setApproveStageConfirmed(false);
      setTriggerBackgroundRemovalConfirmed(false);
    }
  }, [orderId, flaggedCount]);

  // Handle approve stage
  const handleApproveStage = () => {
    setApproveStageConfirmed(true);
    onApprove('approved');
  };

  // Handle un-confirm approve stage (only if trigger is not confirmed)
  const handleUnconfirmApproveStage = () => {
    // Can only un-confirm if trigger is not confirmed
    if (!triggerBackgroundRemovalConfirmed) {
      setApproveStageConfirmed(false);
      onApprove('pending');
    }
  };

  // Handle trigger background removal
  const handleTriggerBackgroundRemoval = () => {
    setTriggerBackgroundRemovalConfirmed(true);
    // Call the workflow initiation
    onInitiateWorkflow();
  };

  // Handle regeneration with polling support
  const handleRegenerate = async (data: {
    poseNumber: number;
    revisionPrompt: string;
    includeBaseCharacter: boolean;
    includePoseReference: boolean;
    includePreviousOption: boolean;
    previousOptionR2Key?: string;
  }) => {
    try {
      // If includePreviousOption is true but no previousOptionR2Key provided, get it from pending revisions
      let previousOptionR2Key = data.previousOptionR2Key;
      if (data.includePreviousOption && !previousOptionR2Key) {
        const poseNN = String(data.poseNumber).padStart(2, '0');
        const revisionKey = `pose${poseNN}`;
        const pendingRevision = pendingRevisions[revisionKey];
        if (pendingRevision) {
          previousOptionR2Key = pendingRevision.r2Key;
        }
      }

      const response = await fetch(`/api/orders/${orderId}/regenerate-pose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          poseNumber: data.poseNumber,
          revisionPrompt: data.revisionPrompt,
          includeBaseCharacter: data.includeBaseCharacter,
          includePoseReference: data.includePoseReference,
          includePreviousOption: data.includePreviousOption,
          previousOptionR2Key: previousOptionR2Key,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        const errorObj = new Error(error.error || 'Failed to regenerate pose');
        // Preserve rate limit info for user-friendly messages
        if (response.status === 429) {
          (errorObj as any).retryAfter = error.retryAfter;
        }
        throw errorObj;
      }

      const result = await response.json();
      console.log('[PreBriaStage] Regenerate response:', result);

      // If status is 'completed', update state immediately
      if (result.status === 'completed' && result.temporaryR2Key) {
        const poseNN = String(data.poseNumber).padStart(2, '0');
        const revisionKey = `pose${poseNN}`;
        const newPreviewUrl = result.previewUrl || result.cloudflareImageUrl || `/api/assets/${result.temporaryR2Key}`;
        
        setPendingRevisions(prev => {
          const previousRevision = prev[revisionKey];
          console.log('[PreBriaStage] Updating pending revision (synchronous completion):', {
            revisionKey,
            r2Key: result.temporaryR2Key,
            previewUrl: newPreviewUrl,
            previousRevisionUrl: previousRevision?.previewUrl,
            urlChanged: previousRevision?.previewUrl !== newPreviewUrl,
          });
          
          return {
            ...prev,
            [revisionKey]: {
              r2Key: result.temporaryR2Key,
              previewUrl: newPreviewUrl,
            },
          };
        });

        // Refresh order data to show new pending revision
        if (onRefresh) {
          await onRefresh();
        }
        return; // Done, no need to poll
      }

      // If status is 'pending' or 'processing', start polling
      if (result.jobId && (result.status === 'pending' || result.status === 'processing')) {
        console.log('[PreBriaStage] Starting polling for jobId:', result.jobId);
        
        const poseNN = String(data.poseNumber).padStart(2, '0');
        const revisionKey = `pose${poseNN}`;
        
        // Clean up any existing polling for this pose
        const existingInterval = pollingIntervalsRef.current.get(revisionKey);
        if (existingInterval) {
          clearInterval(existingInterval);
          pollingIntervalsRef.current.delete(revisionKey);
        }
        const existingTimeout = pollingTimeoutsRef.current.get(revisionKey);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          pollingTimeoutsRef.current.delete(revisionKey);
        }
        
        // Poll every 2-3 seconds (using 2500ms for 2.5 seconds)
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch(`/api/orders/${orderId}/regenerate-pose/${result.jobId}`);
            if (!statusResponse.ok) {
              console.error('[PreBriaStage] Polling error:', statusResponse.status);
              clearInterval(pollInterval);
              pollingIntervalsRef.current.delete(revisionKey);
              return;
            }

            const statusResult = await statusResponse.json();
            console.log('[PreBriaStage] Polling status:', statusResult);

            if (statusResult.status === 'completed') {
              clearInterval(pollInterval);
              pollingIntervalsRef.current.delete(revisionKey);
              
              // Clear timeout if it exists
              const timeout = pollingTimeoutsRef.current.get(revisionKey);
              if (timeout) {
                clearTimeout(timeout);
                pollingTimeoutsRef.current.delete(revisionKey);
              }
              
              // Update pending revisions state
              const newPreviewUrl = statusResult.previewUrl || statusResult.cloudflareImageUrl || `/api/assets/${statusResult.temporaryR2Key}`;
              
              // Get current state to compare
              setPendingRevisions(prev => {
                const previousRevision = prev[revisionKey];
                console.log('[PreBriaStage] Updating pending revision after polling completion:', {
                  revisionKey,
                  r2Key: statusResult.temporaryR2Key,
                  previewUrl: newPreviewUrl,
                  previousRevisionUrl: previousRevision?.previewUrl,
                  urlChanged: previousRevision?.previewUrl !== newPreviewUrl,
                });
                
                const updated = {
                  ...prev,
                  [revisionKey]: {
                    r2Key: statusResult.temporaryR2Key,
                    previewUrl: newPreviewUrl,
                  },
                };
                console.log('[PreBriaStage] Updated pendingRevisions state:', Object.keys(updated));
                return updated;
              });

              // Force a refresh of the poses array by triggering the useEffect
              // The poses array depends on pendingRevisions, so it should update automatically
              // But we'll also refresh order data to ensure everything is in sync
              if (onRefresh) {
                await onRefresh();
              }
            } else if (statusResult.status === 'failed') {
              clearInterval(pollInterval);
              pollingIntervalsRef.current.delete(revisionKey);
              
              // Clear timeout if it exists
              const timeout = pollingTimeoutsRef.current.get(revisionKey);
              if (timeout) {
                clearTimeout(timeout);
                pollingTimeoutsRef.current.delete(revisionKey);
              }
              
              // Don't throw - just log the error (user can see it in the UI if needed)
              console.error('[PreBriaStage] Regeneration failed:', statusResult.error);
            }
            // Continue polling if status is 'pending' or 'processing'
          } catch (error: any) {
            console.error('[PreBriaStage] Polling error:', error);
            clearInterval(pollInterval);
            pollingIntervalsRef.current.delete(revisionKey);
            
            // Clear timeout if it exists
            const timeout = pollingTimeoutsRef.current.get(revisionKey);
            if (timeout) {
              clearTimeout(timeout);
              pollingTimeoutsRef.current.delete(revisionKey);
            }
            
            // Don't throw - polling errors shouldn't break the UI
            // The error is logged, and the user can retry if needed
          }
        }, 2500); // Poll every 2.5 seconds

        // Store interval for cleanup
        pollingIntervalsRef.current.set(revisionKey, pollInterval);

        // Stop polling after 5 minutes (safety timeout)
        const timeout = setTimeout(() => {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(revisionKey);
          pollingTimeoutsRef.current.delete(revisionKey);
          console.warn('[PreBriaStage] Polling timeout after 5 minutes for pose', data.poseNumber);
        }, 5 * 60 * 1000);
        
        pollingTimeoutsRef.current.set(revisionKey, timeout);
      } else {
        // No jobId or unexpected status - refresh anyway
        if (onRefresh) {
          await onRefresh();
        }
      }
    } catch (error: any) {
      console.error('[PreBriaStage] Regenerate failed:', error);
      throw error;
    }
  };

  // Handle accept revision
  const handleAcceptRevision = async (poseNumber: number) => {
    const poseNN = String(poseNumber).padStart(2, '0');
    const revisionKey = `pose${poseNN}`;
    
    // Mark operation as in progress
    operationInProgressRef.current.add(revisionKey);
    
    try {
      // Get current state (use functional update to get latest)
      const currentPendingRevision = pendingRevisions[revisionKey];
      if (!currentPendingRevision) {
        operationInProgressRef.current.delete(revisionKey);
        throw new Error('Pending revision not found');
      }

      // Call replace-image endpoint with temporaryR2Key
      const formData = new FormData();
      formData.append('poseNumber', poseNumber.toString());
      formData.append('stage', 'preBria');
      formData.append('temporaryR2Key', currentPendingRevision.r2Key);

      const response = await fetch(`/api/orders/${orderId}/replace-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        operationInProgressRef.current.delete(revisionKey);
        throw new Error(error.error || 'Failed to accept revision');
      }

      // Remove from pending revisions (use functional update)
      setPendingRevisions(prev => {
        const updated = { ...prev };
        delete updated[revisionKey];
        return updated;
      });

      // Mark operation as complete
      operationInProgressRef.current.delete(revisionKey);

      // Refresh order data
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('[PreBriaStage] Accept revision failed:', error);
      operationInProgressRef.current.delete(revisionKey);
      throw error;
    }
  };

  // Handle reject revision
  const handleRejectRevision = async (poseNumber: number) => {
    const poseNN = String(poseNumber).padStart(2, '0');
    const revisionKey = `pose${poseNN}`;
    
    // Mark operation as in progress
    operationInProgressRef.current.add(revisionKey);
    
    try {
      // Get current state (use functional update to get latest)
      const currentPendingRevision = pendingRevisions[revisionKey];
      if (!currentPendingRevision) {
        operationInProgressRef.current.delete(revisionKey);
        throw new Error('Pending revision not found');
      }

      // Call API to delete temporary file and update manifest
      const response = await fetch(`/api/orders/${orderId}/reject-revision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          poseNumber,
          temporaryR2Key: currentPendingRevision.r2Key,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        operationInProgressRef.current.delete(revisionKey);
        throw new Error(error.error || 'Failed to reject revision');
      }

      // Remove from pending revisions (use functional update)
      setPendingRevisions(prev => {
        const updated = { ...prev };
        delete updated[revisionKey];
        return updated;
      });

      // Mark operation as complete
      operationInProgressRef.current.delete(revisionKey);

      // Refresh order data
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('[PreBriaStage] Reject revision failed:', error);
      operationInProgressRef.current.delete(revisionKey);
      throw error;
    }
  };

  // Handle revise revision (discard previous and create new)
  const handleReviseRevision = async (data: {
    poseNumber: number;
    revisionPrompt: string;
    includeBaseCharacter: boolean;
    includePoseReference: boolean;
    includePreviousOption: boolean;
    previousOptionR2Key?: string;
  }) => {
    // If includePreviousOption is true but no previousOptionR2Key provided, get it from pending revisions
    let previousOptionR2Key = data.previousOptionR2Key;
    if (data.includePreviousOption && !previousOptionR2Key) {
      const poseNN = String(data.poseNumber).padStart(2, '0');
      const revisionKey = `pose${poseNN}`;
      const pendingRevision = pendingRevisions[revisionKey];
      if (pendingRevision) {
        previousOptionR2Key = pendingRevision.r2Key;
      }
    }

    // Revise is the same as regenerate - it will overwrite the previous pending revision
    await handleRegenerate({
      ...data,
      previousOptionR2Key,
    });
  };


  // Check if images are shared with other orders
  const sharedImageInfo = order?.r2Assets?.sharedImageInfo;
  const isImagesShared = sharedImageInfo?.isShared === true;
  const sourceOrderIds = sharedImageInfo?.sourceOrderIds || [];

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
                    {sourceOrderIds.slice(0, 5).map((sourceOrderId) => (
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

      {hasAllImages ? (
        <>
          {/* Base Character Section */}
          <AssetGrid
            title="Base Character"
            description="The main character image that will be used as the foundation for all poses"
            assets={[baseCharacter]}
            onDownload={handleDownload}
            onReplace={handleReplace}
            onFlag={handleFlag}
            onApprove={() => {}} // Base character doesn't need separate approval
            canApprove={false}
            isApproved={true}
            isReplacing={isReplacing}
            disabledReplaceIds={['base-character']}
          />

          {/* Poses Section */}
          <AssetGrid
            title="Character Poses"
            description={`${poses.length} pose${poses.length !== 1 ? 's' : ''} for the character across all story pages`}
            assets={poses}
            onDownload={handleDownload}
            onReplace={handleReplace}
            onFlag={handleFlag}
            onApprove={() => {
              // AssetGrid expects () => void, but onApprove takes a status parameter
              // Since AssetGrid doesn't actually call onApprove, this is a no-op wrapper
            }}
            canApprove={true}
            isApproved={isApproved}
            isReplacing={isReplacing}
            orderId={orderId}
            baseCharacterUrl={baseCharacter.url}
            onRegenerate={handleRegenerate}
            onAcceptRevision={handleAcceptRevision}
            onRejectRevision={handleRejectRevision}
            onReviseRevision={handleReviseRevision}
          />
        </>
      ) : (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Images Found</h3>
          <p className="text-gray-600 mb-4">
            Character images have not been generated yet. This typically happens when:
          </p>
          <ul className="text-sm text-gray-500 text-left max-w-md mx-auto space-y-1">
            <li>• The AI character generation process is still running</li>
            <li>• There was an error during the character generation process</li>
            <li>• The order is still being processed by the system</li>
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

      {/* Stage Actions */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">Stage Actions</h4>
          <p className="text-sm text-gray-600 mb-4">
            {!baseCharacterExists || !allPosesExist || missingCount > 0
              ? 'All images must be available before approving. Please wait for character generation to complete.'
              : flaggedCount > 0
              ? `Please address ${flaggedCount} flagged item${flaggedCount !== 1 ? 's' : ''} before approving.`
              : 'Review all assets and follow the workflow steps below.'
            }
          </p>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Step 1: Approve Stage */}
            <div className="flex items-center gap-2">
              <button
                onClick={approveStageConfirmed ? handleUnconfirmApproveStage : handleApproveStage}
                disabled={approveStageConfirmed ? false : !canApproveStage || triggerBackgroundRemovalConfirmed}
                className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${
                  approveStageConfirmed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 focus:ring-emerald-500'
                    : canApproveStage
                    ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 focus:ring-slate-500'
                    : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
                }`}
              >
                {approveStageConfirmed ? (
                  <>
                    {!triggerBackgroundRemovalConfirmed && <X className="h-4 w-4 mr-2" />}
                    {triggerBackgroundRemovalConfirmed && <CheckCircle className="h-4 w-4 mr-2" />}
                    Approve Stage
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Stage
                  </>
                )}
              </button>
            </div>

            {/* Step 2: Trigger Background Removal */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleTriggerBackgroundRemoval}
                disabled={!canTriggerBackgroundRemoval}
                className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${
                  triggerBackgroundRemovalConfirmed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 focus:ring-emerald-500'
                    : canTriggerBackgroundRemoval
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-300 hover:bg-indigo-100 hover:border-indigo-400 focus:ring-indigo-500'
                    : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
                }`}
              >
                <Play className="h-4 w-4 mr-2" />
                Trigger Background-Removal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
