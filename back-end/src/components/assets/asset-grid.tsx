'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Flag, CheckCircle, Eye } from 'lucide-react';
import { ImageLightbox } from './image-lightbox';

interface Asset {
  id: string;
  name: string;
  url: string;
  isFlagged: boolean;
  hasTransparentBackground?: boolean;
  isMissing?: boolean;
  status?: string;
  reviewReason?: string;
  attempts?: number;
  // Comparison mode data
  comparisonMode?: 'reference' | 'background' | null;
  comparisonImageUrl?: string;
  comparisonLabel?: string;
  poseNumber?: number;
  pageNumber?: number;
  onFlip?: () => void;
  isFlipping?: boolean;
  // Revision data
  pendingRevisionUrl?: string;
  onRevisionBadgeClick?: () => void;
}

interface AssetGridProps {
  title: string;
  description?: string;
  assets: Asset[];
  onDownload: (assetId: string) => void;
  onReplace: (assetId: string, file: File) => void;
  onFlag: (assetId: string) => void;
  onApprove: () => void;
  canApprove: boolean;
  isApproved: boolean;
  showBlackBackground?: boolean;
  isReplacing?: string | null;
  disabledReplaceIds?: string[];
  // Regeneration props (passed to ImageLightbox)
  orderId?: string;
  baseCharacterUrl?: string;
  onRegenerate?: (data: {
    poseNumber: number;
    revisionPrompt: string;
    includeBaseCharacter: boolean;
    includePoseReference: boolean;
    includePreviousOption: boolean;
    previousOptionR2Key?: string;
  }) => Promise<void>;
  onAcceptRevision?: (poseNumber: number) => Promise<void>;
  onRejectRevision?: (poseNumber: number) => Promise<void>;
  onReviseRevision?: (data: {
    poseNumber: number;
    revisionPrompt: string;
    includeBaseCharacter: boolean;
    includePoseReference: boolean;
    includePreviousOption: boolean;
    previousOptionR2Key?: string;
  }) => Promise<void>;
}

export function AssetGrid({
  title,
  description,
  assets,
  onDownload,
  onReplace,
  onFlag,
  onApprove,
  canApprove,
  isApproved,
  showBlackBackground = false,
  isReplacing: externalIsReplacing,
  disabledReplaceIds = [],
  orderId,
  baseCharacterUrl,
  onRegenerate,
  onAcceptRevision,
  onRejectRevision,
  onReviseRevision
}: AssetGridProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Update selectedAsset when the corresponding asset in the assets array changes
  // This ensures the modal shows the updated image after operations like flip, flag, or revision updates
  useEffect(() => {
    if (selectedAsset) {
      const updatedAsset = assets.find(a => a.id === selectedAsset.id);
      if (updatedAsset) {
        // Update if URL changed (for flip/replace), flagged state changed, or pendingRevisionUrl changed
        if (
          updatedAsset.url !== selectedAsset.url || 
          updatedAsset.isFlagged !== selectedAsset.isFlagged ||
          updatedAsset.pendingRevisionUrl !== selectedAsset.pendingRevisionUrl
        ) {
          console.log('[AssetGrid] Updating selectedAsset:', {
            id: updatedAsset.id,
            urlChanged: updatedAsset.url !== selectedAsset.url,
            flaggedChanged: updatedAsset.isFlagged !== selectedAsset.isFlagged,
            pendingRevisionUrlChanged: updatedAsset.pendingRevisionUrl !== selectedAsset.pendingRevisionUrl,
            oldPendingRevisionUrl: selectedAsset.pendingRevisionUrl,
            newPendingRevisionUrl: updatedAsset.pendingRevisionUrl,
          });
        setSelectedAsset(updatedAsset);
        }
      }
    }
  }, [assets, selectedAsset]);
  const [internalIsReplacing, setInternalIsReplacing] = useState<string | null>(null);
  const isReplacing = externalIsReplacing !== undefined ? externalIsReplacing : internalIsReplacing;
  // Use refs to track file inputs for more reliable access
  const fileInputRefs = useRef<Record<string, HTMLInputElement>>({});

  const handleFileReplace = (assetId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Don't clear loading state here - let the parent component's handleReplace manage it
        // The parent will set isReplacing via the prop, or we'll keep it until upload completes
        onReplace(assetId, file);
        // Reset the input value so the same file can be selected again
        // But do this after a small delay to ensure the change event is fully processed
        setTimeout(() => {
          event.target.value = '';
        }, 100);
      } catch (error) {
        console.error('[AssetGrid] Error in onReplace callback:', error);
        // Clear loading state on error
        if (externalIsReplacing === undefined) {
          setInternalIsReplacing(null);
        }
      }
    } else {
      // If no file was selected (user cancelled), clear the loading state
      if (externalIsReplacing === undefined) {
        setInternalIsReplacing(null);
      }
    }
  };

  const flaggedCount = assets.filter(asset => asset.isFlagged).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          {description && (
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          )}
          {flaggedCount > 0 && (
            <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <Flag className="h-3 w-3 mr-1" />
              {flaggedCount} item{flaggedCount !== 1 ? 's' : ''} need attention
            </div>
          )}
        </div>
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="relative group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
            onClick={(e) => {
              // Don't open modal if clicking on the revision badge (it has its own handler)
              const target = e.target as HTMLElement;
              if (target.closest('.revision-badge-container')) {
                return; // Badge click is handled separately
              }
              setSelectedAsset(asset);
            }}
          >
            {/* Image or Placeholder */}
            <div 
              className={`w-full aspect-square flex items-center justify-center ${
                showBlackBackground && asset.hasTransparentBackground ? 'bg-black' : 'bg-gray-50'
              } ${asset.isMissing ? 'bg-red-50 border-2 border-red-300 border-dashed' : ''}`}
            >
              {asset.isMissing || !asset.url ? (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <div className="text-4xl mb-2">⚠️</div>
                  <div className="text-sm font-medium text-red-600 mb-1">Missing</div>
                  {asset.status && (
                    <div className="text-xs text-gray-500 capitalize">{asset.status}</div>
                  )}
                  {asset.reviewReason && (
                    <div className="text-xs text-gray-500 mt-1">{asset.reviewReason.replace(/_/g, ' ')}</div>
                  )}
                  {asset.attempts !== undefined && asset.attempts > 0 && (
                    <div className="text-xs text-gray-500 mt-1">{asset.attempts} attempt{asset.attempts !== 1 ? 's' : ''}</div>
                  )}
                </div>
              ) : (
              <img
                src={asset.url}
                alt={asset.name}
                className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    // Fallback to placeholder if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.missing-placeholder')) {
                      parent.innerHTML = `
                        <div class="missing-placeholder flex flex-col items-center justify-center p-4 text-center">
                          <div class="text-4xl mb-2">⚠️</div>
                          <div class="text-sm font-medium text-red-600">Image not found</div>
                        </div>
                      `;
                    }
                  }}
              />
              )}
            </div>

            {/* Overlay Actions */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none group-hover:pointer-events-auto">
              <div className="flex space-x-2 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-lg" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAsset(asset);
                  }}
                  className="p-2 rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (asset.isMissing || !asset.url) {
                      return; // Don't allow download for missing assets
                    }
                    try {
                      await onDownload(asset.id);
                    } catch (error) {
                      console.error('[AssetGrid] Download error:', error);
                      // Error is already handled in the download handler
                    }
                  }}
                  className={`p-2 rounded-full transition-colors ${
                    asset.isMissing || !asset.url
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  title={asset.isMissing || !asset.url ? 'Download not available' : 'Download'}
                  disabled={asset.isMissing || !asset.url}
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Allow replace for missing assets - this will upload the missing image
                    // The API will handle creating the entry and uploading to the correct location
                    if (disabledReplaceIds.includes(asset.id)) {
                      return;
                    }
                    if (isReplacing === asset.id) {
                      return; // Already replacing
                    }
                    if (externalIsReplacing === undefined) {
                      setInternalIsReplacing(asset.id);
                    }
                    // Use setTimeout to ensure the click happens after event propagation is stopped
                    setTimeout(() => {
                      // Try ref first, then fallback to getElementById
                      const fileInput = fileInputRefs.current[asset.id] || 
                                       document.getElementById(`replace-${asset.id}`) as HTMLInputElement;
                      if (fileInput) {
                        fileInput.click();
                      } else {
                        console.error('[AssetGrid] File input not found! Available refs:', Object.keys(fileInputRefs.current));
                      }
                    }, 0);
                  }}
                  disabled={isReplacing === asset.id || disabledReplaceIds.includes(asset.id)}
                  className={`p-2 rounded-full transition-colors ${
                    isReplacing === asset.id || disabledReplaceIds.includes(asset.id)
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  title={
                    disabledReplaceIds.includes(asset.id)
                      ? 'Replace not available'
                      : isReplacing === asset.id
                      ? 'Replacing...'
                      : asset.isMissing || !asset.url
                      ? 'Upload missing image'
                      : 'Replace'
                  }
                >
                  {isReplacing === asset.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                  ) : (
                  <Upload className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Flag Indicator */}
            {asset.isFlagged && (
              <div className="absolute top-2 right-2">
                <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                  <Flag className="h-3 w-3 text-white" />
                </div>
              </div>
            )}

            {/* Revision Indicator Badge (40x40px) - Top-right, distinct from flag */}
            {asset.pendingRevisionUrl && (
              <div 
                className="revision-badge-container absolute top-2 right-2 z-20 cursor-pointer"
                style={{ 
                  marginRight: asset.isFlagged ? '2.5rem' : '0.5rem' // Offset if flag is present
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (asset.onRevisionBadgeClick) {
                    asset.onRevisionBadgeClick();
                  } else {
                    // Fallback: open modal normally (will show revision option in modal)
                    setSelectedAsset(asset);
                  }
                }}
                title="New revision available - Click to view"
              >
                <div className="w-10 h-10 bg-blue-500 rounded-lg border-2 border-white shadow-lg overflow-hidden hover:ring-2 hover:ring-blue-300 transition-all">
                  {asset.pendingRevisionUrl ? (
                    <img
                      src={asset.pendingRevisionUrl}
                      alt="Revision preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to icon if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="w-full h-full flex items-center justify-center bg-blue-500">
                              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </div>
                          `;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-blue-500">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Asset Name + Flag (contracted view control) */}
            <div className="p-3 flex items-center justify-between relative z-10">
              <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFlag(asset.id);
                }}
                title={asset.isFlagged ? 'Unflag' : 'Flag for Review'}
                className={`ml-2 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  asset.isFlagged ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Flag className="h-3 w-3 mr-1" />
                {asset.isFlagged ? 'Flagged' : 'Flag'}
              </button>
            </div>

            {/* Hidden file input for replacement */}
            <input
              type="file"
              accept="image/*"
              ref={(el) => {
                if (el) {
                  fileInputRefs.current[asset.id] = el;
                } else {
                  delete fileInputRefs.current[asset.id];
                }
              }}
              onChange={(e) => {
                e.stopPropagation();
                // Don't preventDefault on change - it might interfere with file reading
                handleFileReplace(asset.id, e);
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="hidden"
              id={`replace-${asset.id}`}
            />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selectedAsset && (
        <ImageLightbox
          isOpen={!!selectedAsset}
          onClose={() => setSelectedAsset(null)}
          imageUrl={selectedAsset.url}
          imageName={selectedAsset.name}
          onDownload={() => onDownload(selectedAsset.id)}
          onReplace={(file) => onReplace(selectedAsset.id, file)}
          onFlag={() => onFlag(selectedAsset.id)}
          isFlagged={selectedAsset.isFlagged}
          hasTransparentBackground={selectedAsset.hasTransparentBackground}
          showBlackBackground={showBlackBackground}
          comparisonMode={selectedAsset.comparisonMode}
          comparisonImageUrl={selectedAsset.comparisonImageUrl}
          comparisonLabel={selectedAsset.comparisonLabel}
          poseNumber={selectedAsset.poseNumber}
          pageNumber={selectedAsset.pageNumber}
          onFlip={selectedAsset.onFlip}
          isFlipping={selectedAsset.isFlipping}
          pendingRevisionUrl={selectedAsset.pendingRevisionUrl}
          onRevisionBadgeClick={selectedAsset.onRevisionBadgeClick}
          orderId={orderId}
          baseCharacterUrl={baseCharacterUrl}
          onRegenerate={selectedAsset.poseNumber !== undefined ? async (data) => {
            if (onRegenerate) {
              await onRegenerate(data);
              // Refresh the page data to show new pending revision
              // This will be handled by the parent component's onRefresh
            }
          } : undefined}
          onAcceptRevision={selectedAsset.poseNumber !== undefined ? async () => {
            if (onAcceptRevision && selectedAsset.poseNumber !== undefined) {
              await onAcceptRevision(selectedAsset.poseNumber);
            }
          } : undefined}
          onRejectRevision={selectedAsset.poseNumber !== undefined ? async () => {
            if (onRejectRevision && selectedAsset.poseNumber !== undefined) {
              await onRejectRevision(selectedAsset.poseNumber);
            }
          } : undefined}
          onReviseRevision={selectedAsset.poseNumber !== undefined ? async (data) => {
            if (onReviseRevision) {
              await onReviseRevision(data);
            }
          } : undefined}
        />
      )}
    </div>
  );
}
