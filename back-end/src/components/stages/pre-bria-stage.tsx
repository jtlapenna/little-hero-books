'use client';

import { useEffect, useState } from 'react';
import { AssetGrid } from '@/components/assets/asset-grid';
import { CheckCircle, Play, X } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';

interface PreBriaStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
}

export function PreBriaStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow, onRefresh }: PreBriaStageProps) {
  // Initialize with empty state - will be populated from R2 data
  const [baseCharacter, setBaseCharacter] = useState({
    id: 'base-character',
    name: 'Base Character',
    url: '',
    isFlagged: false,
    hasTransparentBackground: false
  });

  const [poses, setPoses] = useState<Array<{ id: string; name: string; url: string; isFlagged: boolean; hasTransparentBackground: boolean; isMissing?: boolean; status?: string; reviewReason?: string; attempts?: number }>>([]);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);

  // Two-step workflow state
  const [approveStageConfirmed, setApproveStageConfirmed] = useState(false);
  const [triggerBackgroundRemovalConfirmed, setTriggerBackgroundRemovalConfirmed] = useState(false);

  // Update state when R2 assets change - use JSON stringify for stable comparison
  // This prevents infinite loops when order object reference changes but data is the same
  const r2Assets = order?.r2Assets;
  const r2AssetsKey = r2Assets ? JSON.stringify({
    baseCharacterUrl: r2Assets.baseCharacter?.url || '',
    posesCount: r2Assets.poses?.length || 0,
    poses: r2Assets.poses?.map(p => ({ poseNumber: p.poseNumber, url: p.url, isMissing: p.isMissing })) || []
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
    const posesData = r2Assets.poses || [];
    console.log('[PreBriaStage] posesData length:', posesData.length, 'sample:', posesData.slice(0, 2).map(p => ({ poseNumber: p.poseNumber, url: p.url?.substring(0, 50) })));
    if (posesData.length > 0) {
      const mappedPoses = posesData.map((pose) => {
        const poseNumber = pose.poseNumber ?? 0;
        const isMissing = pose.isMissing || !pose.url;
        return {
          id: `pose${String(poseNumber).padStart(2, '0')}`,
          name: `Pose ${poseNumber}${isMissing ? ' (Missing)' : ''}`,
          url: pose.url || '',
          isFlagged: pose.isFlagged || isMissing || false, // Auto-flag missing poses
          hasTransparentBackground: false,
          isMissing: isMissing,
          status: pose.status,
          reviewReason: pose.reviewReason,
          attempts: pose.attempts
        };
      });
      console.log('[PreBriaStage] Mapped poses count:', mappedPoses.length, 'sample:', mappedPoses.slice(0, 2).map(p => ({ id: p.id, url: p.url?.substring(0, 50) })));
      setPoses(mappedPoses);
    } else {
      console.log('[PreBriaStage] No poses data, resetting poses array');
      // Reset poses if no R2 data
      setPoses([]);
    }
  }, [r2AssetsKey, orderId]); // Use stable key instead of object reference

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
    
    // Disable base-character replacement (not tracked in manifest)
    if (assetId === 'base-character') {
      console.log('[PreBriaStage] Base character replacement blocked');
      alert('Base character replacement is not yet supported');
      return;
    }

    console.log('[PreBriaStage] Setting isReplacing state to:', assetId);
    setIsReplacing(assetId);
    
    try {
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

      // Create form data
      console.log('[PreBriaStage] Creating FormData...');
      const formData = new FormData();
      formData.append('poseNumber', poseNumber.toString());
      formData.append('stage', 'preBria');
      formData.append('file', file);
      console.log('[PreBriaStage] FormData created, file appended:', file.name);
      // replacedBy is optional - will be added when auth is implemented

      // Call API endpoint
      const apiUrl = `/api/orders/${orderId}/replace-image`;
      console.log('[PreBriaStage] Calling API:', apiUrl);
      console.log('[PreBriaStage] FormData entries:', {
        poseNumber: formData.get('poseNumber'),
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

  const handleFlag = (assetId: string) => {
    if (assetId === 'base-character') {
      setBaseCharacter(prev => {
        const updated = { ...prev, isFlagged: !prev.isFlagged };
        // Update flag count after state change
        setTimeout(() => {
          const allAssets = [updated, ...poses];
          const newFlaggedCount = allAssets.filter(asset => asset.isFlagged).length;
          setFlaggedCount(orderId, 'preBria', newFlaggedCount);
        }, 0);
        return updated;
      });
    } else {
      setPoses(prev => {
        const updated = prev.map(pose => 
          pose.id === assetId ? { ...pose, isFlagged: !pose.isFlagged } : pose
        );
        // Update flag count after state change
        setTimeout(() => {
          const allAssets = [baseCharacter, ...updated];
          const newFlaggedCount = allAssets.filter(asset => asset.isFlagged).length;
          setFlaggedCount(orderId, 'preBria', newFlaggedCount);
        }, 0);
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
  const canApproveStage = flaggedCount === 0 && hasAllImages && missingCount === 0;
  
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
    // Call the actual approval API
    onApprove();
  };

  // Handle un-confirm approve stage (only if trigger is not confirmed)
  const handleUnconfirmApproveStage = () => {
    // Can only un-confirm if trigger is not confirmed
    if (!triggerBackgroundRemovalConfirmed) {
      setApproveStageConfirmed(false);
    }
  };

  // Handle trigger background removal
  const handleTriggerBackgroundRemoval = () => {
    setTriggerBackgroundRemovalConfirmed(true);
    // Call the workflow initiation
    onInitiateWorkflow();
  };


  return (
    <div className="space-y-8">
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
            onApprove={onApprove}
            canApprove={true}
            isApproved={isApproved}
            isReplacing={isReplacing}
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
            {!hasAllImages
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
                disabled={!canApproveStage || (approveStageConfirmed && triggerBackgroundRemovalConfirmed)}
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
