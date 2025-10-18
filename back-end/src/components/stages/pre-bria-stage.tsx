'use client';

import { useEffect, useState } from 'react';
import { AssetGrid } from '@/components/assets/asset-grid';
import { CheckCircle, Play } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';

interface PreBriaStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
}

export function PreBriaStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow }: PreBriaStageProps) {
  // Debug: Check if order has R2 assets
  console.log('PreBriaStage rendered with order:', order?.orderId, 'R2 assets:', !!order?.r2Assets);
  
  // Initialize with empty state - will be populated from R2 data
  const [baseCharacter, setBaseCharacter] = useState({
    id: 'base-character',
    name: 'Base Character',
    url: '',
    isFlagged: false,
    hasTransparentBackground: false
  });

  const [poses, setPoses] = useState([]);

  // Update state when order data changes
  useEffect(() => {
    if (!order?.r2Assets) {
      console.log('PreBriaStage: No R2 assets available');
      return;
    }

    console.log('PreBriaStage: Updating with R2 data:', order.r2Assets);
    
    // Update base character if available
    if (order.r2Assets.baseCharacter && order.r2Assets.baseCharacter.url) {
      console.log('PreBriaStage: Setting base character from R2');
      setBaseCharacter({
        id: 'base-character',
        name: 'Base Character',
        url: order.r2Assets.baseCharacter.url,
        isFlagged: false,
        hasTransparentBackground: false
      });
    } else {
      // Reset base character if no R2 data
      setBaseCharacter({
        id: 'base-character',
        name: 'Base Character',
        url: '',
        isFlagged: false,
        hasTransparentBackground: false
      });
    }

    // Update poses if available
    if (order.r2Assets.poses && order.r2Assets.poses.length > 0) {
      console.log('PreBriaStage: Setting poses from R2:', order.r2Assets.poses.length, 'poses');
      setPoses(order.r2Assets.poses.map((pose, index) => ({
        id: `pose${String(index + 1).padStart(2, '0')}`,
        name: `Pose ${index + 1}`,
        url: pose.url,
        isFlagged: false,
        hasTransparentBackground: false
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
  const hasImages = baseCharacter.url && poses.length > 0;
  const canApprove = flaggedCount === 0 && hasImages;

  useEffect(() => {
    setFlaggedCount(orderId, 'preBria', flaggedCount);
  }, [orderId, flaggedCount]);


  return (
    <div className="space-y-8">
      {hasImages ? (
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
          />

          {/* Poses Section */}
          <AssetGrid
            title="Character Poses"
            description="12 different poses for the character across all story pages"
            assets={poses}
            onDownload={handleDownload}
            onReplace={handleReplace}
            onFlag={handleFlag}
            onApprove={onApprove}
            canApprove={true}
            isApproved={isApproved}
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
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">Stage Actions</h4>
            <p className="text-sm text-gray-600 mt-1">
              {isApproved 
                ? 'This stage has been approved. You can now initiate the next workflow.'
                : !hasImages
                ? 'Images are not available yet. Please wait for character generation to complete before approving.'
                : flaggedCount > 0
                ? `Please address ${flaggedCount} flagged item${flaggedCount !== 1 ? 's' : ''} before approving.`
                : 'Review all assets and approve when ready to proceed to background removal.'
              }
            </p>
          </div>
          
          <div className="flex space-x-3">
            {isApproved ? (
              <button
                onClick={onInitiateWorkflow}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <Play className="h-4 w-4 mr-2" />
                Initiate Next Workflow
              </button>
            ) : (
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
          </div>
        </div>
      </div>
    </div>
  );
}
