'use client';

import { useState, useRef } from 'react';
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
  disabledReplaceIds = []
}: AssetGridProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
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
            onClick={() => setSelectedAsset(asset)}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if (asset.isMissing || !asset.url) {
                      return; // Don't allow download for missing assets
                    }
                    onDownload(asset.id);
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
        />
      )}
    </div>
  );
}
