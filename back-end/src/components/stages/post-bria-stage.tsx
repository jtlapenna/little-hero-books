'use client';

import { useEffect, useState } from 'react';
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
  const [poses, setPoses] = useState([]);

  // Update state when order data changes - use actual poseNumber from data to support any number of poses (including pose0)
  useEffect(() => {
    if (order.r2Assets?.posesBgRemoved && order.r2Assets.posesBgRemoved.length > 0) {
      console.log('PostBriaStage: Setting poses from R2:', order.r2Assets.posesBgRemoved.length, 'poses');
      setPoses(order.r2Assets.posesBgRemoved.map((pose) => {
        const poseNumber = pose.poseNumber ?? 0;
        return {
          id: `pose${String(poseNumber).padStart(2, '0')}-bg-removed`,
          name: `Pose ${poseNumber} (BG Removed)`,
          url: pose.url,
          isFlagged: false,
          hasTransparentBackground: true
        };
      }));
    } else {
      // Reset poses if no R2 data
      setPoses([]);
    }
  }, [order]);

  const handleDownload = (assetId: string) => {
    console.log('Downloading asset:', assetId);
    // In real implementation, this would trigger a download
  };

  const handleReplace = (assetId: string, file: File) => {
    console.log('Replacing asset:', assetId, file.name);
    // In real implementation, this would upload the new file to R2
    // After replacement, refresh to show updated image
    if (onRefresh) {
      setTimeout(() => {
        handleRefresh();
      }, 1000); // Wait 1 second for upload to complete
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
      const updated = prev.map(pose => 
        pose.id === assetId ? { ...pose, isFlagged: !pose.isFlagged } : pose
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
  const hasImages = poses.length > 0;
  // Post‑Bria approval rule: if 2B populated images and none are flagged, allow approval
  const isPreBriaApproved = order.reviewStages.preBria.status === 'approved';
  const canApprove = flaggedCount === 0 && hasImages;
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

  useEffect(() => {
    setFlaggedCount(orderId, 'postBria', flaggedCount);
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
