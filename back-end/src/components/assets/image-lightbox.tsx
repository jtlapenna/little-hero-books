'use client';

import { useState, useEffect } from 'react';
import { X, Download, Upload, Flag, CheckCircle } from 'lucide-react';

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
  showBlackBackground = false
}: ImageLightboxProps) {
  const [isReplacing, setIsReplacing] = useState(false);

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
      onReplace(file);
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
        </div>

        {/* Actions */}
        <div className="bg-white px-6 py-4 rounded-b-lg border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={onDownload}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </button>

              <button
                onClick={() => setIsReplacing(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace
              </button>

              <button
                onClick={onFlag}
                className={`inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${
                  isFlagged
                    ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <Flag className="h-4 w-4 mr-2" />
                {isFlagged ? 'Unflag' : 'Flag for Review'}
              </button>
            </div>

            <div className="text-sm text-gray-500">
              Press Esc or click outside to close
            </div>
          </div>

          {/* Hidden file input for replacement */}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileReplace}
            className="hidden"
            id="image-replace-input"
          />
        </div>
      </div>
    </div>
  );
}

