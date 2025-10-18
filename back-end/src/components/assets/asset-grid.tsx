'use client';

import { useState } from 'react';
import { Download, Upload, Flag, CheckCircle, Eye } from 'lucide-react';
import { ImageLightbox } from './image-lightbox';

interface Asset {
  id: string;
  name: string;
  url: string;
  isFlagged: boolean;
  hasTransparentBackground?: boolean;
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
  showBlackBackground = false
}: AssetGridProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);

  const handleFileReplace = (assetId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onReplace(assetId, file);
      setIsReplacing(null);
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
        
        {canApprove && (
          <button
            onClick={onApprove}
            disabled={isApproved || flaggedCount > 0}
            className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium ${
              isApproved
                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                : flaggedCount > 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isApproved ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approved
              </>
            ) : (
              'Approve All'
            )}
          </button>
        )}
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="relative group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedAsset(asset)}
          >
            {/* Image */}
            <div 
              className={`w-full aspect-square flex items-center justify-center ${
                showBlackBackground && asset.hasTransparentBackground ? 'bg-black' : 'bg-gray-50'
              }`}
            >
              <img
                src={asset.url}
                alt={asset.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            {/* Overlay Actions */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAsset(asset);
                  }}
                  className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(asset.id);
                  }}
                  className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsReplacing(asset.id);
                  }}
                  className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
                  title="Replace"
                >
                  <Upload className="h-4 w-4" />
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
              onChange={(e) => handleFileReplace(asset.id, e)}
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
        />
      )}
    </div>
  );
}
