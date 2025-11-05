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
  
  // Initialize with empty state
  const [poses, setPoses] = useState([
    { id: 'pose01-bg-removed', name: 'Walking (BG Removed)', url: '/mock-assets/pose01-walking-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose02-bg-removed', name: 'Walking Looking Higher (BG Removed)', url: '/mock-assets/pose02-walking-looking-higher-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose03-bg-removed', name: 'Looking (BG Removed)', url: '/mock-assets/pose03-looking-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose04-bg-removed', name: 'Floating (BG Removed)', url: '/mock-assets/pose04-floating-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose05-bg-removed', name: 'Walking Looking Down (BG Removed)', url: '/mock-assets/pose05-walking-looking-down-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose06-bg-removed', name: 'Jogging (BG Removed)', url: '/mock-assets/pose06-jogging-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose07-bg-removed', name: 'Sitting Eating (BG Removed)', url: '/mock-assets/pose07-sitting-eating-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose08-bg-removed', name: 'Crouching (BG Removed)', url: '/mock-assets/pose08-crouching-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose09-bg-removed', name: 'Crawling Moving Happy (BG Removed)', url: '/mock-assets/pose09-crawling-moving-happy-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose10-bg-removed', name: 'Surprised Looking Up (BG Removed)', url: '/mock-assets/pose10-surprised-looking-up-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose11-bg-removed', name: 'Surprised (BG Removed)', url: '/mock-assets/pose11-surprised-bg-removed.png', isFlagged: false, hasTransparentBackground: true },
    { id: 'pose12-bg-removed', name: 'Flying (BG Removed)', url: '/mock-assets/pose12-flying-bg-removed.png', isFlagged: false, hasTransparentBackground: true }
  ]);

  // Update state when order data changes
  useEffect(() => {
    if (order.r2Assets?.posesBgRemoved && order.r2Assets.posesBgRemoved.length > 0) {
      setPoses(order.r2Assets.posesBgRemoved.map((pose, index) => ({
        id: `pose${String(index + 1).padStart(2, '0')}-bg-removed`,
        name: `Pose ${index + 1} (BG Removed)`,
        url: pose.url,
        isFlagged: false,
        hasTransparentBackground: true
      })));
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
  const canTriggerAssembly = isApproved && hasImages;

  const [isTriggering, setIsTriggering] = useState(false);

  const handleTriggerBookAssembly = async () => {
    if (!canTriggerAssembly || isTriggering) return;
    setIsTriggering(true);
    try {
      const token = localStorage.getItem('adminToken') || '';
      const resp = await fetch(`/api/orders/${orderId}/trigger-book-assembly`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('Trigger assembly failed', resp.status, txt);
        alert('Failed to trigger book assembly');
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
          
          <div className="flex space-x-3">
            {/* Approve Stage */}
            {!isApproved && (
              <button
                onClick={onApprove}
                disabled={!canApprove}
                className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  canApprove
                    ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve Stage
              </button>
            )}

            {/* Trigger Book Assembly */}
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
