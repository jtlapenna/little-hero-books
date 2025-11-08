'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Download, Upload, Flag, CheckCircle, RotateCcw } from 'lucide-react';

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName: string;
  onDownload: () => void;
  onReplace: (file: File) => void;
  onFlag: () => void;
  isFlagged: boolean;
  hasTransparentBackground?: boolean;
  onToggleBackground?: () => void;
  showBlackBackground?: boolean;
  // Comparison mode props
  comparisonMode?: 'reference' | 'background' | null;
  comparisonImageUrl?: string;
  comparisonLabel?: string;
  poseNumber?: number;
  pageNumber?: number;
  onFlip?: () => void;
  isFlipping?: boolean;
}

export function ImageLightbox({
  isOpen,
  onClose,
  imageUrl,
  imageName,
  onDownload,
  onReplace,
  onFlag,
  isFlagged,
  hasTransparentBackground = false,
  onToggleBackground,
  showBlackBackground = false,
  comparisonMode = null,
  comparisonImageUrl,
  comparisonLabel,
  poseNumber,
  pageNumber,
  onFlip,
  isFlipping = false
}: ImageLightboxProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const [comparisonImageLoading, setComparisonImageLoading] = useState(false);
  const [comparisonImageError, setComparisonImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when lightbox is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle click outside to close
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const handleFileReplace = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsReplacing(true);
      onReplace(file);
      // Reset the input value so the same file can be selected again
      setTimeout(() => {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setIsReplacing(false);
      }, 100);
    } else {
      // User cancelled file picker
      setIsReplacing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      onClick={handleBackdropClick}
    >
      <div 
        className="relative max-w-4xl max-h-[90vh] w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-t-lg">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900">{imageName}</h3>
            {isFlagged && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                <Flag className="h-3 w-3 mr-1" />
                Needs Attention
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Image Container */}
        <div className="bg-white p-6">
          {comparisonMode && comparisonImageUrl ? (
            // Comparison mode: side-by-side layout
            <div className="space-y-4">
              {/* Labels */}
              <div className="flex flex-col md:flex-row md:justify-between gap-2 text-sm font-medium text-gray-700">
                <div>Generated / Character</div>
                <div>{comparisonLabel || 'Reference'}</div>
              </div>
              
              {/* Images */}
              <div className="flex flex-col md:flex-row gap-4">
                {/* Left: Generated/Character Image */}
                <div className="flex-1">
                  <div 
                    className={`relative w-full aspect-square flex items-center justify-center ${
                      showBlackBackground && hasTransparentBackground ? 'bg-black' : 'bg-gray-50'
                    } rounded-lg overflow-hidden`}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={imageName}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-gray-400 text-sm">Image not available</div>
                    )}
                    
                    {/* Background Toggle for Transparent Images */}
                    {hasTransparentBackground && onToggleBackground && (
                      <div className="absolute top-2 right-2">
                        <button
                          onClick={onToggleBackground}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            showBlackBackground
                              ? 'bg-black text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {showBlackBackground ? 'Hide' : 'Show'} BG
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Right: Reference/Background Image */}
                <div className="flex-1">
                  <div className="relative w-full aspect-square flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
                    {comparisonImageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
                      </div>
                    )}
                    {comparisonImageError ? (
                      <div className="text-gray-400 text-sm text-center p-4">
                        {comparisonLabel || 'Reference'} not found
                      </div>
                    ) : comparisonImageUrl ? (
                      <img
                        src={comparisonImageUrl}
                        alt={comparisonLabel || 'Reference'}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => {
                          setComparisonImageLoading(false);
                          setComparisonImageError(false);
                        }}
                        onError={() => {
                          setComparisonImageLoading(false);
                          setComparisonImageError(true);
                        }}
                        onLoadStart={() => {
                          setComparisonImageLoading(true);
                          setComparisonImageError(false);
                        }}
                      />
                    ) : (
                      <div className="text-gray-400 text-sm">Not available</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Single image mode (existing layout)
            <div 
              className={`relative mx-auto max-w-2xl ${
                showBlackBackground ? 'bg-black' : 'bg-transparent'
              }`}
            >
              <img
                src={imageUrl}
                alt={imageName}
                className="max-w-full max-h-[60vh] object-contain mx-auto"
              />
              
              {/* Background Toggle for Transparent Images */}
              {hasTransparentBackground && onToggleBackground && (
                <div className="absolute top-4 right-4">
                  <button
                    onClick={onToggleBackground}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      showBlackBackground
                        ? 'bg-black text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {showBlackBackground ? 'Hide' : 'Show'} Background
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white px-6 py-4 rounded-b-lg border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isReplacing) return;
                  setIsReplacing(true);
                  // Trigger file input click
                  setTimeout(() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.click();
                    }
                  }, 0);
                }}
                disabled={isReplacing}
                className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  isReplacing
                    ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
                    : 'text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                {isReplacing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
                    Replacing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Replace
                  </>
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFlag();
                }}
                className={`inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${
                  isFlagged
                    ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <Flag className="h-4 w-4 mr-2" />
                {isFlagged ? 'Unflag' : 'Flag for Review'}
              </button>

              {/* Flip button (only for Post-Bria background preview) */}
              {comparisonMode === 'background' && onFlip && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isFlipping) return;
                    onFlip();
                  }}
                  disabled={isFlipping}
                  className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    isFlipping
                      ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
                      : 'text-gray-700 bg-white hover:bg-gray-50'
                  }`}
                >
                  {isFlipping ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
                      Flipping...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Flip Horizontally
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="text-sm text-gray-500">
              Press Esc or click outside to close
            </div>
          </div>

          {/* Hidden file input for replacement */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileReplace}
            onClick={(e) => e.stopPropagation()}
            className="hidden"
            id="image-replace-input"
          />
        </div>
      </div>
    </div>
  );
}

