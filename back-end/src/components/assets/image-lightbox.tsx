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
  // Revision props
  pendingRevisionUrl?: string;
  onRevisionBadgeClick?: () => void;
  // Regeneration props
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
  onAcceptRevision?: () => Promise<void>;
  onRejectRevision?: () => Promise<void>;
  onReviseRevision?: (data: {
    poseNumber: number;
    revisionPrompt: string;
    includeBaseCharacter: boolean;
    includePoseReference: boolean;
    includePreviousOption: boolean;
    previousOptionR2Key?: string;
  }) => Promise<void>;
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
  isFlipping = false,
  pendingRevisionUrl,
  onRevisionBadgeClick,
  orderId,
  baseCharacterUrl,
  onRegenerate,
  onAcceptRevision,
  onRejectRevision,
  onReviseRevision
}: ImageLightboxProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const [comparisonImageLoading, setComparisonImageLoading] = useState(false);
  const [comparisonImageError, setComparisonImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Regeneration UI state
  const [showRegenerateUI, setShowRegenerateUI] = useState(false);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [includeBaseCharacter, setIncludeBaseCharacter] = useState(false);
  const [includePoseReference, setIncludePoseReference] = useState(false);
  const [includePreviousOption, setIncludePreviousOption] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showNewOption, setShowNewOption] = useState(false); // Toggle between original and new option
  const [newOptionUrl, setNewOptionUrl] = useState<string | null>(pendingRevisionUrl || null);
  const [temporaryR2Key, setTemporaryR2Key] = useState<string | null>(null);

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

  // Update newOptionUrl when pendingRevisionUrl changes
  useEffect(() => {
    if (pendingRevisionUrl) {
      setNewOptionUrl(pendingRevisionUrl);
      setShowNewOption(true); // Auto-show new option when it becomes available
    }
  }, [pendingRevisionUrl]);

  // Determine if this is a first revision (no previous option exists)
  const isFirstRevision = !pendingRevisionUrl;

  // Set default image selection based on whether it's first or subsequent revision
  useEffect(() => {
    if (showRegenerateUI && isFirstRevision) {
      // First revision: default to base + pose (like original generation)
      setIncludeBaseCharacter(true);
      setIncludePoseReference(true);
      setIncludePreviousOption(false);
    } else if (showRegenerateUI && !isFirstRevision) {
      // Subsequent revision: default to previous option only
      setIncludeBaseCharacter(false);
      setIncludePoseReference(false);
      setIncludePreviousOption(true);
    }
  }, [showRegenerateUI, isFirstRevision]);

  const handleRegenerate = async () => {
    // Validate poseNumber (0 is valid, so check for null/undefined explicitly)
    if (!onRegenerate || poseNumber === null || poseNumber === undefined || !revisionPrompt.trim()) {
      setGenerationError('Please enter a revision prompt');
      return;
    }

    // Validate that at least one image is selected
    if (!includeBaseCharacter && !includePoseReference && !includePreviousOption) {
      setGenerationError('Please select at least one image to include in the revision (Base Character, Pose Reference, or Previous Option)');
      return;
    }

    // Validate previousOptionR2Key if includePreviousOption is true
    if (includePreviousOption && !temporaryR2Key && !pendingRevisionUrl) {
      setGenerationError('Previous option is not available. Please select a different image option.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      // Extract R2 key from pendingRevisionUrl if temporaryR2Key is not set
      let previousOptionR2Key = temporaryR2Key;
      if (includePreviousOption && !previousOptionR2Key && pendingRevisionUrl) {
        // Extract R2 key from preview URL (e.g., "/api/assets/book-mvp-simple-adventure/..." -> "book-mvp-simple-adventure/...")
        previousOptionR2Key = pendingRevisionUrl.replace('/api/assets/', '');
      }

      await onRegenerate({
        poseNumber,
        revisionPrompt: revisionPrompt.trim(),
        includeBaseCharacter,
        includePoseReference,
        includePreviousOption,
        previousOptionR2Key: includePreviousOption ? previousOptionR2Key : undefined,
      });
      // Success - the parent component will update pendingRevisionUrl
      // Close the regenerate UI and show the new option
      setShowRegenerateUI(false);
      setRevisionPrompt(''); // Clear prompt after success
    } catch (error: any) {
      console.error('[ImageLightbox] Regenerate failed:', error);
      
      // Enhanced error handling with user-friendly messages
      let errorMessage = 'Failed to regenerate image. Please try again.';
      
      if (error.message) {
        if (error.message.includes('Rate limit exceeded')) {
          errorMessage = error.message;
          if (error.retryAfter) {
            const minutes = Math.ceil(error.retryAfter / 60);
            errorMessage += ` You can try again in approximately ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
          }
        } else if (error.message.includes('blocked by Gemini safety filters')) {
          errorMessage = 'Your revision prompt was blocked by content safety filters. Please try a different prompt.';
        } else if (error.message.includes('At least one image must be selected')) {
          errorMessage = 'Please select at least one image to include in the revision (Base Character, Pose Reference, or Previous Option)';
        } else if (error.message.includes('previousOptionR2Key is required')) {
          errorMessage = 'Previous option is not available. Please select a different image option.';
        } else if (error.message.includes('Network error')) {
          errorMessage = 'Network error: Please check your connection and try again.';
        } else if (error.message.includes('after') && error.message.includes('attempts')) {
          errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setGenerationError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = async () => {
    if (!onAcceptRevision) return;
    try {
      await onAcceptRevision();
      // Clear new option state after acceptance
      setNewOptionUrl(null);
      setShowNewOption(false);
      setTemporaryR2Key(null);
      // Close regenerate UI if open
      setShowRegenerateUI(false);
    } catch (error: any) {
      console.error('[ImageLightbox] Accept failed:', error);
      const errorMessage = error.message || 'Failed to accept revision. Please try again.';
      alert(errorMessage);
    }
  };

  const handleReject = async () => {
    if (!onRejectRevision) return;
    try {
      await onRejectRevision();
      // Clear new option state after rejection
      setNewOptionUrl(null);
      setShowNewOption(false);
      setTemporaryR2Key(null);
      // Close regenerate UI if open
      setShowRegenerateUI(false);
    } catch (error: any) {
      console.error('[ImageLightbox] Reject failed:', error);
      const errorMessage = error.message || 'Failed to reject revision. Please try again.';
      alert(errorMessage);
    }
  };

  const handleRevise = async () => {
    // Validate poseNumber (0 is valid, so check for null/undefined explicitly)
    if (!onReviseRevision || poseNumber === null || poseNumber === undefined || !revisionPrompt.trim()) {
      setGenerationError('Please enter a revision prompt');
      return;
    }

    // Validate that at least one image is selected
    if (!includeBaseCharacter && !includePoseReference && !includePreviousOption) {
      setGenerationError('Please select at least one image to include in the revision (Base Character, Pose Reference, or Previous Option)');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      // Extract R2 key from newOptionUrl if temporaryR2Key is not set
      let previousOptionR2Key = temporaryR2Key;
      if (includePreviousOption && !previousOptionR2Key && newOptionUrl) {
        // Extract R2 key from preview URL
        previousOptionR2Key = newOptionUrl.replace('/api/assets/', '');
      }

      await onReviseRevision({
        poseNumber,
        revisionPrompt: revisionPrompt.trim(),
        includeBaseCharacter,
        includePoseReference,
        includePreviousOption,
        previousOptionR2Key: includePreviousOption ? previousOptionR2Key : undefined,
      });
      // Success - the parent component will update pendingRevisionUrl
      setShowRegenerateUI(false);
      setRevisionPrompt(''); // Clear prompt after success
    } catch (error: any) {
      console.error('[ImageLightbox] Revise failed:', error);
      
      // Enhanced error handling with user-friendly messages
      let errorMessage = 'Failed to revise image. Please try again.';
      
      if (error.message) {
        if (error.message.includes('Rate limit exceeded')) {
          errorMessage = error.message;
          if (error.retryAfter) {
            const minutes = Math.ceil(error.retryAfter / 60);
            errorMessage += ` You can try again in approximately ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
          }
        } else if (error.message.includes('blocked by Gemini safety filters')) {
          errorMessage = 'Your revision prompt was blocked by content safety filters. Please try a different prompt.';
        } else if (error.message.includes('At least one image must be selected')) {
          errorMessage = 'Please select at least one image to include in the revision (Base Character, Pose Reference, or Previous Option)';
        } else if (error.message.includes('previousOptionR2Key is required')) {
          errorMessage = 'Previous option is not available. Please select a different image option.';
        } else if (error.message.includes('Network error')) {
          errorMessage = 'Network error: Please check your connection and try again.';
        } else if (error.message.includes('after') && error.message.includes('attempts')) {
          errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setGenerationError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const handleFileReplace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsReplacing(true);
      try {
        // onReplace is async, wait for it to complete
        await onReplace(file);
      } catch (error) {
        console.error('[ImageLightbox] Replace failed:', error);
        // Error handling is done in the parent component
      } finally {
        // Reset the input value so the same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setIsReplacing(false);
      }
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
        className="relative max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col bg-white rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - fixed */}
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-t-lg flex-shrink-0">
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

        {/* Image Container - scrollable */}
        <div className="bg-white p-6 overflow-y-auto flex-1">
          {/* Regeneration UI Section */}
          {showRegenerateUI && poseNumber !== undefined && poseNumber !== null && (
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <h4 className="text-sm font-semibold text-indigo-900 mb-3">Regenerate Pose {poseNumber}</h4>
              
              {/* Revision Prompt Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Revision Prompt
                </label>
                <textarea
                  value={revisionPrompt}
                  onChange={(e) => {
                    e.stopPropagation();
                    setRevisionPrompt(e.target.value);
                  }}
                  placeholder="Describe the changes you want (e.g., 'Make the hair longer', 'Adjust the arm position')"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 bg-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-400"
                  rows={3}
                  disabled={isGenerating}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                />
              </div>

              {/* Image Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Include Images in Revision
                </label>
                <div className="flex flex-wrap gap-4">
                  {/* Base Character */}
                  {baseCharacterUrl && (
                    <label 
                      className="flex items-center space-x-3 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={includeBaseCharacter}
                        onChange={(e) => {
                          e.stopPropagation();
                          setIncludeBaseCharacter(e.target.checked);
                        }}
                        disabled={isGenerating}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div className="flex items-center space-x-2">
                        <img
                          src={baseCharacterUrl}
                          alt="Base Character"
                          className="w-12 h-12 object-cover rounded border border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Base Character</span>
                      </div>
                    </label>
                  )}

                  {/* Pose Reference */}
                  {comparisonImageUrl && (
                    <label 
                      className="flex items-center space-x-3 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={includePoseReference}
                        onChange={(e) => {
                          e.stopPropagation();
                          setIncludePoseReference(e.target.checked);
                        }}
                        disabled={isGenerating}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div className="flex items-center space-x-2">
                        <img
                          src={comparisonImageUrl}
                          alt="Pose Reference"
                          className="w-12 h-12 object-cover rounded border border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Pose Reference</span>
                      </div>
                    </label>
                  )}

                  {/* Previous Option */}
                  {pendingRevisionUrl && (
                    <label 
                      className="flex items-center space-x-3 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={includePreviousOption}
                        onChange={(e) => {
                          e.stopPropagation();
                          setIncludePreviousOption(e.target.checked);
                        }}
                        disabled={isGenerating}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div className="flex items-center space-x-2">
                        <img
                          src={pendingRevisionUrl}
                          alt="Previous Option"
                          className="w-12 h-12 object-cover rounded border border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Previous Option</span>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {generationError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{generationError}</p>
                </div>
              )}

              {/* Generate Button */}
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRegenerateUI(false);
                    setRevisionPrompt('');
                    setGenerationError(null);
                  }}
                  disabled={isGenerating}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRegenerate();
                  }}
                  disabled={isGenerating || !revisionPrompt.trim() || (!includeBaseCharacter && !includePoseReference && !includePreviousOption)}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                      Generating...
                    </>
                  ) : (
                    'Generate'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Tab/Toggle for Original vs New Option */}
          {newOptionUrl && comparisonMode && (
            <div className="mb-4">
              <div className="flex items-center space-x-2 border-b border-gray-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNewOption(false);
                  }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    !showNewOption
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNewOption(true);
                  }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    showNewOption
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  New Option
                </button>
              </div>
            </div>
          )}

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
                {/* Left: Generated/Character Image (with toggle for new option) */}
                <div className="flex-1">
                  <div 
                    className={`relative w-full aspect-square flex items-center justify-center ${
                      showBlackBackground && hasTransparentBackground ? 'bg-black' : 'bg-gray-50'
                    } rounded-lg overflow-hidden`}
                  >
                    {showNewOption && newOptionUrl ? (
                      // Show new option when toggled
                      <>
                        <img
                          src={newOptionUrl}
                          alt="New Option"
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                        {/* Accept/Reject/Revise buttons - only visible when new option is shown */}
                        {showNewOption && (
                          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAccept();
                              }}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                            >
                              Accept
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReject();
                              }}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              Reject
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Extract R2 key from preview URL
                                const r2Key = newOptionUrl ? newOptionUrl.replace('/api/assets/', '') : null;
                                setTemporaryR2Key(r2Key);
                                setShowRegenerateUI(true);
                                setShowNewOption(false); // Switch back to original view while showing regenerate UI
                              }}
                              className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-300 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Revise
                            </button>
                          </div>
                        )}
                      </>
                    ) : imageUrl ? (
                      // Show original image
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

        {/* Actions - fixed */}
        <div className="bg-white px-6 py-4 rounded-b-lg border-t border-gray-200 flex-shrink-0">
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

              {/* Regenerate button (only for Tab 1 poses) */}
              {poseNumber !== undefined && poseNumber !== null && !showNewOption && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRegenerateUI(!showRegenerateUI);
                    if (!showRegenerateUI) {
                      setRevisionPrompt('');
                      setGenerationError(null);
                    }
                  }}
                  className="inline-flex items-center px-4 py-2 border border-indigo-300 rounded-md shadow-sm text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate
                </button>
              )}

              {/* New Option Available button (when pending revision exists) */}
              {newOptionUrl && !showNewOption && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNewOption(true);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  New Option Available
                </button>
              )}

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

