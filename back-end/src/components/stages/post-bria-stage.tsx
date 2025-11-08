'use client';

import { useEffect, useState, useRef } from 'react';
import { AssetGrid } from '@/components/assets/asset-grid';
import { CheckCircle, Play, Eye, RefreshCw } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';

interface PostBriaStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
}

export function PostBriaStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow, onRefresh }: PostBriaStageProps) {
  const [showBlackBackground, setShowBlackBackground] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [approveStageConfirmed, setApproveStageConfirmed] = useState(!!isApproved);

  // keep local confirm state in sync if parent updates
  useEffect(() => {
    setApproveStageConfirmed(!!isApproved);
  }, [isApproved]);
  
  // Initialize with empty state - will be populated from R2 data
  const [poses, setPoses] = useState<Array<{ id: string; name: string; url: string; isFlagged: boolean; hasTransparentBackground: boolean; isMissing?: boolean; status?: string; reviewReason?: string; attempts?: number; comparisonMode?: 'reference' | 'background' | null; comparisonImageUrl?: string; comparisonLabel?: string; poseNumber?: number; pageNumber?: number; onFlip?: () => void; isFlipping?: boolean }>>([]);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);
  const [flippingPoseId, setFlippingPoseId] = useState<string | null>(null);

  // Update state when R2 assets change - use ref to track previous key and prevent infinite loops
  const posesBgRemoved = order?.r2Assets?.posesBgRemoved || [];
  const prevKeyRef = useRef<string>('');
  // Track poses that the user has manually unflagged (persist across re-renders)
  const manuallyUnflaggedRef = useRef<Set<string>>(new Set());
  
  // Reset manually unflagged set when order changes
  useEffect(() => {
    manuallyUnflaggedRef.current.clear();
  }, [orderId]);
  
  useEffect(() => {
    // Calculate stable key from actual data - include isFlagged and needsReview to detect flag changes
    const currentKey = JSON.stringify(posesBgRemoved.map(p => ({ 
      poseNumber: p.poseNumber, 
      url: p.url, 
      isMissing: p.isMissing,
      isFlagged: p.isFlagged,
      needsReview: p.needsReview
    })));
    
    // Only update if the key actually changed
    if (currentKey === prevKeyRef.current) {
      return;
    }
    
    prevKeyRef.current = currentKey;
    
    if (posesBgRemoved.length > 0) {
      setPoses(posesBgRemoved.map((pose) => {
        const poseNumber = pose.poseNumber ?? 0;
        const poseId = `pose${String(poseNumber).padStart(2, '0')}-bg-removed`;
        const isMissing = pose.isMissing || !pose.url;
        
        // Check if user has manually unflagged this pose - if so, respect that decision
        const isManuallyUnflagged = manuallyUnflaggedRef.current.has(poseId);
        
        // Set isFlagged based on isFlagged, needsReview, or isMissing
        // BUT: if user manually unflagged it, don't re-flag it (unless it's missing)
        const shouldBeFlagged = isMissing || (!isManuallyUnflagged && (pose.isFlagged || pose.needsReview));
        
        // Map pose to page number (first page that uses this pose)
        const poseToFirstPage: Record<number, number> = {
          0: 0,  1: 1,  2: 2,  3: 3,  4: 4,  5: 5,  6: 6,
          7: 8,  8: 9,  9: 10, 10: 11, 11: 12, 12: 14
        };
        const pageNumber = poseToFirstPage[poseNumber] ?? null;
        
        // Build background URL
        let backgroundUrl: string | null = null;
        if (pageNumber !== null) {
          const sceneSlugs = [
            'dedication',        // page00
            'twilight-walk',    // page01
            'night-forest',     // page02
            'magic-doorway',    // page03
            'courage-leap',     // page04
            'morning-meadow',   // page05
            'tall-forest',      // page06
            'mountain-vista',   // page07
            'picnic-surprise',  // page08
            'beach-discovery',  // page09
            'crystal-cave',     // page10
            'giant-flowers',    // page11
            'almost-there',     // page12
            'animal-reveal',    // page13
            'flying-home'       // page14
          ];
          
          if (pageNumber === 0) {
            backgroundUrl = '/api/assets/book-mvp-simple-adventure/backgrounds/page00-dedication.png';
          } else if (pageNumber >= 1 && pageNumber <= 14) {
            const slug = sceneSlugs[pageNumber];
            const padded = String(pageNumber).padStart(2, '0');
            backgroundUrl = `/api/assets/book-mvp-simple-adventure/backgrounds/page${padded}-${slug}.png`;
          }
        }
        
        return {
          id: poseId,
          name: `Pose ${poseNumber} (BG Removed)${isMissing ? ' (Missing)' : ''}`,
          url: pose.url || '',
          isFlagged: shouldBeFlagged, // Respect user unflag decisions
          hasTransparentBackground: true,
          isMissing: isMissing,
          status: pose.status,
          reviewReason: pose.reviewReason,
          attempts: pose.attempts,
          // Comparison mode data for Post-Bria
          comparisonMode: backgroundUrl ? 'background' as const : null,
          comparisonImageUrl: backgroundUrl ?? undefined,
          comparisonLabel: 'Page Background',
          poseNumber: poseNumber,
          pageNumber: pageNumber ?? undefined,
          // Flip handler
          onFlip: () => handleFlip(poseId, poseNumber),
          isFlipping: flippingPoseId === poseId
        };
      }));
    } else {
      // Reset poses if no R2 data
      setPoses([]);
    }
  }, [posesBgRemoved, orderId, flippingPoseId]); // Include flippingPoseId to update isFlipping state

  const handleFlip = async (assetId: string, poseNumber: number) => {
    console.log('[PostBriaStage] handleFlip called with assetId:', assetId, 'poseNumber:', poseNumber);
    
    setFlippingPoseId(assetId);
    
    try {
      // Find the current pose to get its URL
      const currentPose = poses.find(p => p.id === assetId);
      if (!currentPose) {
        alert(`Pose ${assetId} not found in current poses list`);
        setFlippingPoseId(null);
        return;
      }
      if (!currentPose.url || currentPose.url.trim() === '') {
        alert(`Image URL is missing for pose ${assetId}. The image may not have been generated yet.`);
        setFlippingPoseId(null);
        return;
      }

      // Check if URL is a data URL (from previous flip) - if so, we need to fetch the original from R2
      let imageUrl = currentPose.url;
      if (imageUrl.startsWith('data:')) {
        // Data URL from previous flip - we need to get the original image from the API
        console.log('[PostBriaStage] URL is a data URL, fetching original from API');
        // Fetch the original image URL from the order data
        const orderResponse = await fetch(`/api/orders/${orderId}`);
        if (!orderResponse.ok) {
          throw new Error('Failed to fetch order data');
        }
        const orderData = await orderResponse.json();
        const originalPose = orderData.r2Assets?.posesBgRemoved?.find((p: any) => p.poseNumber === poseNumber);
        if (!originalPose || !originalPose.url) {
          throw new Error('Original image URL not found in order data');
        }
        imageUrl = originalPose.url;
        console.log('[PostBriaStage] Using original URL:', imageUrl);
      }

      // Ensure URL is absolute if it's a relative path
      if (imageUrl.startsWith('/')) {
        imageUrl = window.location.origin + imageUrl;
      }

      // Load the image
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Allow CORS if needed
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Image load timeout'));
        }, 30000); // 30 second timeout
        
        img.onload = () => {
          clearTimeout(timeout);
          resolve(null);
        };
        img.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[PostBriaStage] Image load error:', error, 'URL:', imageUrl);
          reject(new Error(`Failed to load image from ${imageUrl}. This may be a CORS issue or the image may not exist.`));
        };
        img.src = imageUrl;
      });

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

      // Create FormData and upload the flipped image
      const formData = new FormData();
      formData.append('poseNumber', poseNumber.toString());
      formData.append('stage', 'postBria');
      formData.append('file', blob, `pose${String(poseNumber).padStart(2, '0')}-nobg.png`);

      const response = await fetch(`/api/orders/${orderId}/replace-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Failed to upload flipped image';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
          console.error('[PostBriaStage] API error response:', error);
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
    } catch (error: any) {
      console.error('[PostBriaStage] Error flipping image:', error);
      alert(`Failed to flip image: ${error.message || 'Unknown error'}`);
    } finally {
      setFlippingPoseId(null);
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

      // Create form data
      console.log('[PostBriaStage] Creating FormData...');
      const formData = new FormData();
      formData.append('poseNumber', poseNumber.toString());
      formData.append('stage', 'postBria');
      formData.append('file', file);
      console.log('[PostBriaStage] FormData created, file appended:', file.name);
      // replacedBy is optional - will be added when auth is implemented

      // Call API endpoint
      const apiUrl = `/api/orders/${orderId}/replace-image`;
      console.log('[PostBriaStage] Calling API:', apiUrl);
      console.log('[PostBriaStage] FormData entries:', {
        poseNumber: formData.get('poseNumber'),
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
          const error = await response.json();
          errorMessage = error.error || errorMessage;
          console.error('[PostBriaStage] API error response:', error);
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
          console.error('[PostBriaStage] Failed to parse error response');
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[PostBriaStage] Image replaced successfully:', result);

      // Refresh the order data to show updated image
    if (onRefresh) {
        console.log('[PostBriaStage] Calling onRefresh...');
        await onRefresh();
        console.log('[PostBriaStage] onRefresh completed');
      } else {
        console.warn('[PostBriaStage] No onRefresh callback provided');
      }
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
      if (onRefresh) {
        await onRefresh();
      } else {
        // Fallback: reload the page
        window.location.reload();
      }
    } catch (error) {
      console.error('Error refreshing images:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFlag = (assetId: string) => {
    setPoses(prev => {
      const currentPose = prev.find(p => p.id === assetId);
      if (!currentPose) return prev;
      
      const newFlaggedState = !currentPose.isFlagged;
      
      // Track user's manual unflag decision
      if (!newFlaggedState) {
        // User is unflagging - add to manually unflagged set
        manuallyUnflaggedRef.current.add(assetId);
      } else {
        // User is flagging - remove from manually unflagged set (they changed their mind)
        manuallyUnflaggedRef.current.delete(assetId);
      }
      
      const updated = prev.map(pose => 
        pose.id === assetId ? { ...pose, isFlagged: newFlaggedState } : pose
      );
      // Update flag count after state change
      setTimeout(() => {
        const newFlaggedCount = updated.filter(asset => asset.isFlagged).length;
        setFlaggedCount(orderId, 'postBria', newFlaggedCount);
      }, 0);
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

  const handleApproveStage = async () => {
    if (approveStageConfirmed) return;
    try {
      await onApprove();
      setApproveStageConfirmed(true);
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
      // Call n8n webhook directly (mirrors 2B pattern)
      const webhookUrl = 'https://thepeakbeyond.app.n8n.cloud/webhook/book-assembly';
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('Trigger assembly failed', resp.status, txt);
        alert(`Failed to trigger book assembly: ${resp.status} ${txt}`);
        return;
      }
      alert('Book assembly triggered');
    } catch (e) {
      console.error('Trigger assembly error', e);
      alert('Error triggering book assembly');
    } finally {
      setIsTriggering(false);
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

  return (
    <div className="space-y-8">
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
          onApprove={onApprove}
          canApprove={true}
          isApproved={isApproved}
          showBlackBackground={showBlackBackground}
          isReplacing={isReplacing}
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
              onClick={handleApproveStage}
              disabled={approveStageConfirmed || !canApprove}
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
              title={isApproved ? 'Trigger Workflow 3 (Book Assembly)' : 'Approve stage to enable book assembly'}
              >
              <Play className="h-4 w-4 mr-2" />
              {isTriggering ? 'Triggering…' : 'Trigger Book Assembly'}
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}
