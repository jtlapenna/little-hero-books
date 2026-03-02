'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Download, Upload, Flag, CheckCircle, RotateCcw, Sparkles } from 'lucide-react';

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
  // Fix transparency (Post-Bria modal)
  showFixTransparency?: boolean;
  onFixTransparency?: (options: {
    fixEyes: boolean;
    fixTeeth: boolean;
    eyes?: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number }; radius?: number; leftRadius?: number; rightRadius?: number };
    teeth?: { center: { x: number; y: number }; rx: number; ry: number };
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
  onReviseRevision,
  showFixTransparency = false,
  onFixTransparency
}: ImageLightboxProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const [comparisonImageLoading, setComparisonImageLoading] = useState(false);
  const [comparisonImageError, setComparisonImageError] = useState(false);
  const [mainImageRetry, setMainImageRetry] = useState(0);
  const [comparisonImageRetry, setComparisonImageRetry] = useState(0);
  const mainRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const comparisonRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const RETRY_DELAYS_MS = [1000, 3000, 7000, 15000];

  const withRetryParam = (url: string, retry: number, key: string): string => {
    if (!url || !retry) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${key}=${retry}`;
  };

  const scheduleMainRetry = () => {
    const next = mainImageRetry + 1;
    if (next > RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[next - 1];
    if (mainRetryTimerRef.current) clearTimeout(mainRetryTimerRef.current);
    mainRetryTimerRef.current = setTimeout(() => setMainImageRetry(next), delay);
  };

  const scheduleComparisonRetry = () => {
    const next = comparisonImageRetry + 1;
    if (next > RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[next - 1];
    if (comparisonRetryTimerRef.current) clearTimeout(comparisonRetryTimerRef.current);
    comparisonRetryTimerRef.current = setTimeout(() => setComparisonImageRetry(next), delay);
  };

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
  // Fix transparency (Post-Bria)
  const [showFixTransparencyPanel, setShowFixTransparencyPanel] = useState(false);
  const [fixEyes, setFixEyes] = useState(true);
  const [fixTeeth, setFixTeeth] = useState(true);
  const [isFixing, setIsFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  // Shape positions (0–1 normalized), aligned with API defaults
  const [eyesShape, setEyesShape] = useState({
    leftEye: { x: 0.4, y: 0.28 },
    rightEye: { x: 0.6, y: 0.28 },
    leftRadius: 0.045,
    rightRadius: 0.045,
  });
  const [teethShape, setTeethShape] = useState({
    center: { x: 0.5, y: 0.42 },
    rx: 0.08,
    ry: 0.04,
  });
  const dragStateRef = useRef<{
    shape: 'leftEye' | 'rightEye' | 'teeth';
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    shape: 'eyesRadiusLeft' | 'eyesRadiusRight' | 'teethRx' | 'teethRy';
    startClientX: number;
    startClientY: number;
    startValue: number;
  } | null>(null);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const handleShapePointerDown = (
    shape: 'leftEye' | 'rightEye' | 'teeth',
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    let startX: number;
    let startY: number;
    if (shape === 'leftEye') {
      startX = eyesShape.leftEye.x;
      startY = eyesShape.leftEye.y;
    } else if (shape === 'rightEye') {
      startX = eyesShape.rightEye.x;
      startY = eyesShape.rightEye.y;
    } else {
      startX = teethShape.center.x;
      startY = teethShape.center.y;
    }
    dragStateRef.current = { shape, startClientX: e.clientX, startClientY: e.clientY, startX, startY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleShapePointerMove = (e: React.PointerEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const deltaNormX = (e.clientX - state.startClientX) / rect.width;
    const deltaNormY = (e.clientY - state.startClientY) / rect.height;
    const newX = clamp01(state.startX + deltaNormX);
    const newY = clamp01(state.startY + deltaNormY);
    if (state.shape === 'leftEye') {
      setEyesShape((prev) => ({ ...prev, leftEye: { x: newX, y: newY } }));
    } else if (state.shape === 'rightEye') {
      setEyesShape((prev) => ({ ...prev, rightEye: { x: newX, y: newY } }));
    } else {
      setTeethShape((prev) => ({ ...prev, center: { x: newX, y: newY } }));
    }
  };

  const handleShapePointerUp = (e: React.PointerEvent) => {
    dragStateRef.current = null;
    resizeStateRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (
    shape: 'eyesRadiusLeft' | 'eyesRadiusRight' | 'teethRx' | 'teethRy',
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    const startValue =
      shape === 'eyesRadiusLeft' ? eyesShape.leftRadius
      : shape === 'eyesRadiusRight' ? eyesShape.rightRadius
      : shape === 'teethRx' ? teethShape.rx
      : teethShape.ry;
    resizeStateRef.current = {
      shape,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startValue,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = 2; // Sensitivity: pixels to normalized delta
    const deltaY = (e.clientY - state.startClientY) / rect.height;
    const deltaX = (e.clientX - state.startClientX) / rect.width;
    const delta = state.shape === 'teethRx' ? deltaX * scale : deltaY * scale;
    const newValue = Math.max(0.01, Math.min(0.3, state.startValue + delta));
    if (state.shape === 'eyesRadiusLeft') {
      setEyesShape((prev) => ({ ...prev, leftRadius: newValue }));
    } else if (state.shape === 'eyesRadiusRight') {
      setEyesShape((prev) => ({ ...prev, rightRadius: newValue }));
    } else if (state.shape === 'teethRx') {
      setTeethShape((prev) => ({ ...prev, rx: newValue }));
    } else {
      setTeethShape((prev) => ({ ...prev, ry: newValue }));
    }
  };

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

  // Reset retries when displayed URLs change (or on open) and cleanup timers on unmount.
  useEffect(() => {
    setMainImageRetry(0);
    setComparisonImageRetry(0);
    setComparisonImageError(false);
    setComparisonImageLoading(false);
    if (mainRetryTimerRef.current) clearTimeout(mainRetryTimerRef.current);
    if (comparisonRetryTimerRef.current) clearTimeout(comparisonRetryTimerRef.current);
    return () => {
      if (mainRetryTimerRef.current) clearTimeout(mainRetryTimerRef.current);
      if (comparisonRetryTimerRef.current) clearTimeout(comparisonRetryTimerRef.current);
    };
  }, [isOpen, imageUrl, newOptionUrl, showNewOption, comparisonImageUrl]);

  // Handle click outside to close
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // Track previous pendingRevisionUrl to detect when it changes
  // Initialize with current value to ensure accurate comparison
  const prevPendingRevisionUrlRef = useRef<string | undefined>(pendingRevisionUrl);
  // Track cache-busting timestamp for image URLs (updates only when URL changes)
  const imageCacheBusterRef = useRef<number>(Date.now());
  
  // Initialize ref on mount or when pendingRevisionUrl first becomes available
  useEffect(() => {
    if (pendingRevisionUrl && !prevPendingRevisionUrlRef.current) {
      console.log('[ImageLightbox] Initializing prevPendingRevisionUrlRef with:', pendingRevisionUrl);
      prevPendingRevisionUrlRef.current = pendingRevisionUrl;
    }
  }, []);

  // Update newOptionUrl when pendingRevisionUrl changes
  // When a new revision arrives, update the URL and reset the view state
  useEffect(() => {
    const prevUrl = prevPendingRevisionUrlRef.current;
    const currentUrl = pendingRevisionUrl;

    console.log('[ImageLightbox] useEffect triggered:', {
      prevUrl,
      currentUrl,
      isOpen,
      showNewOption,
      newOptionUrl,
      urlsMatch: currentUrl === prevUrl,
      prevUrlType: typeof prevUrl,
      currentUrlType: typeof currentUrl,
      prevUrlLength: prevUrl?.length,
      currentUrlLength: currentUrl?.length,
    });

    // Always update the ref to the current value (for next comparison)
    // But only update state if the URL actually changed
    // Use strict comparison to catch undefined/null changes
    const urlChanged = currentUrl !== prevUrl;
    
    if (urlChanged) {
      console.log('[ImageLightbox] Pending revision URL changed - updating state:', {
        prevUrl,
        currentUrl,
        isOpen,
        wasShowingNewOption: showNewOption,
        previousNewOptionUrl: newOptionUrl,
        urlChanged: true,
        prevUrlString: String(prevUrl),
        currentUrlString: String(currentUrl),
      });
      prevPendingRevisionUrlRef.current = currentUrl;

      if (currentUrl) {
        // Always update to the latest revision URL
        // This will cause the image to update if showNewOption is true
        setNewOptionUrl(currentUrl);
        
        // Update cache-buster timestamp when URL changes (forces image reload)
        imageCacheBusterRef.current = Date.now();
        
        // If user is currently viewing a previous revision, keep showing the new option
        // Use functional update to read current state value
        setShowNewOption(prevShowNewOption => {
          // If already showing a revision, keep showing (so new revision appears immediately)
          // If not showing, keep it false (so "New Option Available" button appears)
          const shouldShow = prevShowNewOption; // Keep current state
          console.log('[ImageLightbox] showNewOption state:', {
            previous: prevShowNewOption,
            willKeep: shouldShow,
            reason: shouldShow ? 'User is viewing revision, keep showing new one' : 'User not viewing, show button instead'
          });
          return shouldShow;
        });
        
        // Update temporaryR2Key from the URL for revise operations
        // Handle both /api/assets/ and Cloudflare Images URLs
        // The URL now includes r2Key as a query parameter for cache-busting
        let r2Key: string | null = null;
        
        // First, try to extract R2 key from query parameter (added by parent for cache-busting)
        const urlObj = new URL(currentUrl, window.location.origin);
        const r2KeyParam = urlObj.searchParams.get('r2Key');
        if (r2KeyParam) {
          r2Key = decodeURIComponent(r2KeyParam);
          console.log('[ImageLightbox] Extracted R2 key from query parameter:', r2Key);
        } else if (currentUrl.includes('/api/assets/')) {
          // Fallback: extract from path if no query parameter
          r2Key = currentUrl.replace('/api/assets/', '').split('?')[0]; // Remove query params
        } else if (currentUrl.includes('imagedelivery.net')) {
          // For Cloudflare Images URLs, we can't extract the R2 key from the URL path
          // But the parent should have added it as a query parameter
          console.warn('[ImageLightbox] Cloudflare Images URL detected, R2 key not found in query parameter');
        }
        setTemporaryR2Key(r2Key);
        console.log('[ImageLightbox] Updated newOptionUrl to latest revision', {
          r2Key,
          newOptionUrl: currentUrl,
          cacheBuster: imageCacheBusterRef.current,
          showNewOptionWillBe: showNewOption, // Current value before state update
        });
      } else {
        setNewOptionUrl(null);
        setTemporaryR2Key(null);
        // If no pending revision, reset to original view
        setShowNewOption(false);
        console.log('[ImageLightbox] Cleared newOptionUrl (no pending revision)');
      }
    } else {
      // URLs match, but ensure ref is in sync
      // Also check if we need to update the cache-buster if the URL is the same but we want to force a reload
      if (currentUrl && currentUrl === prevUrl && currentUrl === newOptionUrl) {
        // URL hasn't changed, but if we're showing it, we might need to refresh
        // This handles the case where the same URL is used but the image content changed
        console.log('[ImageLightbox] Pending revision URL unchanged, but checking if refresh needed');
      }
      prevPendingRevisionUrlRef.current = currentUrl;
      console.log('[ImageLightbox] Pending revision URL unchanged, ref synced', {
        currentUrl,
        prevUrl,
        newOptionUrl,
      });
    }
  }, [pendingRevisionUrl]); // Removed other dependencies to ensure this runs whenever pendingRevisionUrl changes

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
        previousOptionR2Key: includePreviousOption ? (previousOptionR2Key || undefined) : undefined,
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
    
    // Disable buttons during operation
    const wasGenerating = isGenerating;
    setIsGenerating(true);
    
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
      // Don't clear state on error - let user retry
    } finally {
      setIsGenerating(wasGenerating);
    }
  };

  const handleReject = async () => {
    if (!onRejectRevision) return;
    
    // Disable buttons during operation
    const wasGenerating = isGenerating;
    setIsGenerating(true);
    
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
      // Don't clear state on error - let user retry
    } finally {
      setIsGenerating(wasGenerating);
    }
  };

  const handleFixTransparency = async () => {
    if (!onFixTransparency || (!fixEyes && !fixTeeth)) return;
    setIsFixing(true);
    setFixError(null);
    try {
      await onFixTransparency({
        fixEyes,
        fixTeeth,
        eyes: fixEyes ? eyesShape : undefined,
        teeth: fixTeeth ? teethShape : undefined,
      });
      setShowFixTransparencyPanel(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFixError(msg);
    } finally {
      setIsFixing(false);
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
      // Use temporaryR2Key if available (set when revision arrives)
      // This ensures we use the most recent revision's R2 key
      let previousOptionR2Key = temporaryR2Key;
      if (includePreviousOption && !previousOptionR2Key) {
        // Fallback: try to extract from newOptionUrl (for R2 URLs only)
        if (newOptionUrl && newOptionUrl.includes('/api/assets/')) {
          previousOptionR2Key = newOptionUrl.replace('/api/assets/', '');
        } else if (pendingRevisionUrl && pendingRevisionUrl.includes('/api/assets/')) {
          // Last resort: extract from pendingRevisionUrl
          previousOptionR2Key = pendingRevisionUrl.replace('/api/assets/', '');
        } else {
          // If we can't extract the R2 key, log a warning
          console.warn('[ImageLightbox] Cannot extract R2 key for previous option, temporaryR2Key:', temporaryR2Key);
        }
      }

      console.log('[ImageLightbox] handleRevise - previousOptionR2Key:', previousOptionR2Key, {
        temporaryR2Key,
        newOptionUrl,
        pendingRevisionUrl,
        includePreviousOption,
      });

      await onReviseRevision({
        poseNumber,
        revisionPrompt: revisionPrompt.trim(),
        includeBaseCharacter,
        includePoseReference,
        includePreviousOption,
        previousOptionR2Key: includePreviousOption ? (previousOptionR2Key || undefined) : undefined,
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
        className="relative max-w-6xl max-h-[90vh] w-full mx-4 flex flex-col bg-white rounded-lg overflow-hidden"
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

              {/* Image Selection and Buttons - Same Row */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Include Images in Revision
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  {/* Image Selection Thumbnails */}
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

                    {/* Previous Option - Use newOptionUrl if available (current revision), otherwise use pendingRevisionUrl */}
                    {(newOptionUrl || pendingRevisionUrl) && (
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
                            src={newOptionUrl || pendingRevisionUrl || ''}
                            alt="Previous Option"
                            className="w-12 h-12 object-cover rounded border border-gray-300"
                          />
                          <span className="text-sm text-gray-700">Previous Option</span>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Cancel and Generate Buttons */}
                  <div className="flex items-center space-x-3 ml-auto">
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
              </div>

              {/* Error Message */}
              {generationError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{generationError}</p>
                </div>
              )}
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
                          key={`${newOptionUrl}-${imageCacheBusterRef.current}`} // Force re-render when URL or cache-buster changes
                          src={withRetryParam(newOptionUrl, mainImageRetry, 'lr')} // URL already includes cache-busting from parent; add retry suffix for transient failures
                          alt="New Option"
                          className="max-w-full max-h-full object-contain"
                          onLoad={() => {
                            if (mainRetryTimerRef.current) clearTimeout(mainRetryTimerRef.current);
                          }}
                          onError={(e) => {
                            scheduleMainRetry();
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
                                // Use temporaryR2Key if available (set when revision arrives)
                                // Fallback to extracting from URL if not set (for R2 URLs only)
                                let r2Key = temporaryR2Key;
                                if (!r2Key && newOptionUrl) {
                                  // Only try to extract from URL if it's an R2 URL (not Cloudflare Images)
                                  if (newOptionUrl.includes('/api/assets/')) {
                                    r2Key = newOptionUrl.replace('/api/assets/', '');
                                  } else {
                                    // For Cloudflare Images URLs, we need to get R2 key from pending revisions
                                    // This should already be set in temporaryR2Key, but if not, log a warning
                                    console.warn('[ImageLightbox] Cannot extract R2 key from Cloudflare Images URL, using temporaryR2Key:', temporaryR2Key);
                                  }
                                }
                                // Ensure temporaryR2Key is set for the revise operation
                                if (r2Key) {
                                  setTemporaryR2Key(r2Key);
                                }
                                setShowRegenerateUI(true);
                                // Keep showing the new option (don't switch back to original)
                                // This ensures the user can see the current revision while entering a new prompt
                                setShowNewOption(true);
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
                        src={withRetryParam(imageUrl, mainImageRetry, 'lr')}
                        alt={imageName}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => {
                          if (mainRetryTimerRef.current) clearTimeout(mainRetryTimerRef.current);
                        }}
                        onError={(e) => {
                          scheduleMainRetry();
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
                    {/* Fix transparency overlay (shapes driven by checkboxes, draggable) */}
                    {showFixTransparencyPanel && showFixTransparency && (
                      <svg
                        viewBox="0 0 1 1"
                        preserveAspectRatio="xMidYMid meet"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      >
                        {fixEyes && (
                          <g pointerEvents="auto">
                            <circle
                              cx={eyesShape.leftEye.x}
                              cy={eyesShape.leftEye.y}
                              r={eyesShape.leftRadius}
                              fill="#f2e2bb"
                              className="cursor-grab active:cursor-grabbing"
                              onPointerDown={(e) => handleShapePointerDown('leftEye', e)}
                              onPointerMove={handleShapePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                            <circle
                              cx={eyesShape.rightEye.x}
                              cy={eyesShape.rightEye.y}
                              r={eyesShape.rightRadius}
                              fill="#f2e2bb"
                              className="cursor-grab active:cursor-grabbing"
                              onPointerDown={(e) => handleShapePointerDown('rightEye', e)}
                              onPointerMove={handleShapePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                            {/* Resize handle for left eye radius */}
                            <circle
                              cx={eyesShape.leftEye.x}
                              cy={eyesShape.leftEye.y + eyesShape.leftRadius}
                              r={0.015}
                              fill="#d4a84b"
                              stroke="#fff"
                              strokeWidth={0.005}
                              className="cursor-n-resize"
                              onPointerDown={(e) => handleResizePointerDown('eyesRadiusLeft', e)}
                              onPointerMove={handleResizePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                            {/* Resize handle for right eye radius */}
                            <circle
                              cx={eyesShape.rightEye.x}
                              cy={eyesShape.rightEye.y + eyesShape.rightRadius}
                              r={0.015}
                              fill="#d4a84b"
                              stroke="#fff"
                              strokeWidth={0.005}
                              className="cursor-n-resize"
                              onPointerDown={(e) => handleResizePointerDown('eyesRadiusRight', e)}
                              onPointerMove={handleResizePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                          </g>
                        )}
                        {fixTeeth && (
                          <g pointerEvents="auto">
                            <ellipse
                              cx={teethShape.center.x}
                              cy={teethShape.center.y}
                              rx={teethShape.rx}
                              ry={teethShape.ry}
                              fill="#FFFFFF"
                              className="cursor-grab active:cursor-grabbing"
                              onPointerDown={(e) => handleShapePointerDown('teeth', e)}
                              onPointerMove={handleShapePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                            {/* Resize handle for teeth rx (right edge) */}
                            <circle
                              cx={teethShape.center.x + teethShape.rx}
                              cy={teethShape.center.y}
                              r={0.015}
                              fill="#999"
                              stroke="#fff"
                              strokeWidth={0.005}
                              className="cursor-ew-resize"
                              onPointerDown={(e) => handleResizePointerDown('teethRx', e)}
                              onPointerMove={handleResizePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                            {/* Resize handle for teeth ry (bottom edge) */}
                            <circle
                              cx={teethShape.center.x}
                              cy={teethShape.center.y + teethShape.ry}
                              r={0.015}
                              fill="#999"
                              stroke="#fff"
                              strokeWidth={0.005}
                              className="cursor-ns-resize"
                              onPointerDown={(e) => handleResizePointerDown('teethRy', e)}
                              onPointerMove={handleResizePointerMove}
                              onPointerUp={handleShapePointerUp}
                              onPointerCancel={handleShapePointerUp}
                            />
                          </g>
                        )}
                      </svg>
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
                        src={withRetryParam(comparisonImageUrl, comparisonImageRetry, 'cr')}
                        alt={comparisonLabel || 'Reference'}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => {
                          if (comparisonRetryTimerRef.current) clearTimeout(comparisonRetryTimerRef.current);
                          setComparisonImageLoading(false);
                          setComparisonImageError(false);
                        }}
                        onError={() => {
                          setComparisonImageLoading(false);
                          if (comparisonImageRetry < RETRY_DELAYS_MS.length) {
                            setComparisonImageError(false);
                            scheduleComparisonRetry();
                          } else {
                            setComparisonImageError(true);
                          }
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
                src={withRetryParam(imageUrl, mainImageRetry, 'lr')}
                alt={imageName}
                className="max-w-full max-h-[60vh] object-contain mx-auto"
                onLoad={() => {
                  if (mainRetryTimerRef.current) clearTimeout(mainRetryTimerRef.current);
                }}
                onError={() => {
                  scheduleMainRetry();
                }}
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
              {/* Fix transparency overlay (single image mode, draggable) */}
              {showFixTransparencyPanel && showFixTransparency && (
                <svg
                  viewBox="0 0 1 1"
                  preserveAspectRatio="xMidYMid meet"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {fixEyes && (
                    <g pointerEvents="auto">
                      <circle
                        cx={eyesShape.leftEye.x}
                        cy={eyesShape.leftEye.y}
                        r={eyesShape.leftRadius}
                        fill="#f2e2bb"
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => handleShapePointerDown('leftEye', e)}
                        onPointerMove={handleShapePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                      <circle
                        cx={eyesShape.rightEye.x}
                        cy={eyesShape.rightEye.y}
                        r={eyesShape.rightRadius}
                        fill="#f2e2bb"
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => handleShapePointerDown('rightEye', e)}
                        onPointerMove={handleShapePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                      <circle
                        cx={eyesShape.leftEye.x}
                        cy={eyesShape.leftEye.y + eyesShape.leftRadius}
                        r={0.015}
                        fill="#d4a84b"
                        stroke="#fff"
                        strokeWidth={0.005}
                        className="cursor-n-resize"
                        onPointerDown={(e) => handleResizePointerDown('eyesRadiusLeft', e)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                      <circle
                        cx={eyesShape.rightEye.x}
                        cy={eyesShape.rightEye.y + eyesShape.rightRadius}
                        r={0.015}
                        fill="#d4a84b"
                        stroke="#fff"
                        strokeWidth={0.005}
                        className="cursor-n-resize"
                        onPointerDown={(e) => handleResizePointerDown('eyesRadiusRight', e)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                    </g>
                  )}
                  {fixTeeth && (
                    <g pointerEvents="auto">
                      <ellipse
                        cx={teethShape.center.x}
                        cy={teethShape.center.y}
                        rx={teethShape.rx}
                        ry={teethShape.ry}
                        fill="#FFFFFF"
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => handleShapePointerDown('teeth', e)}
                        onPointerMove={handleShapePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                      <circle
                        cx={teethShape.center.x + teethShape.rx}
                        cy={teethShape.center.y}
                        r={0.015}
                        fill="#999"
                        stroke="#fff"
                        strokeWidth={0.005}
                        className="cursor-ew-resize"
                        onPointerDown={(e) => handleResizePointerDown('teethRx', e)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                      <circle
                        cx={teethShape.center.x}
                        cy={teethShape.center.y + teethShape.ry}
                        r={0.015}
                        fill="#999"
                        stroke="#fff"
                        strokeWidth={0.005}
                        className="cursor-ns-resize"
                        onPointerDown={(e) => handleResizePointerDown('teethRy', e)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleShapePointerUp}
                        onPointerCancel={handleShapePointerUp}
                      />
                    </g>
                  )}
                </svg>
              )}
            </div>
          )}
        </div>

        {/* Actions - fixed */}
        <div className="bg-white px-6 py-4 rounded-b-lg border-t border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3 flex-nowrap overflow-x-auto min-w-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="inline-flex items-center justify-center w-[160px] px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 whitespace-nowrap"
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
                className={`inline-flex items-center justify-center w-[160px] px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 whitespace-nowrap ${
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
                className={`inline-flex items-center justify-center w-[160px] px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 whitespace-nowrap ${
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
                  className="inline-flex items-center justify-center w-[160px] px-4 py-2 border border-indigo-300 rounded-md shadow-sm text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 whitespace-nowrap"
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
                  className="inline-flex items-center justify-center w-[160px] px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 whitespace-nowrap"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  New Option Available
                </button>
              )}

              {/* Flip button (for Pre-Bria and Post-Bria) */}
              {onFlip && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isFlipping) return;
                    onFlip();
                  }}
                  disabled={isFlipping}
                  className={`inline-flex items-center justify-center w-[160px] px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 whitespace-nowrap ${
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

              {/* Fix transparency (Post-Bria only) */}
              {showFixTransparency && onFixTransparency && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFixTransparencyPanel(!showFixTransparencyPanel);
                    setFixError(null);
                  }}
                  className="inline-flex items-center justify-center w-[160px] px-4 py-2 border border-amber-300 rounded-md shadow-sm text-sm font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Fix Transparency
                </button>
              )}
            </div>
          </div>

          {/* Fix transparency panel (Post-Bria) */}
          {showFixTransparencyPanel && showFixTransparency && onFixTransparency && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-sm font-semibold text-amber-900 mb-3">Fix transparency (eyes / teeth)</h4>
              <p className="text-xs text-amber-800 mb-3">Drag shapes to reposition; use handles to resize. Uncheck to remove.</p>
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={fixEyes}
                    onChange={(e) => setFixEyes(e.target.checked)}
                    disabled={isFixing}
                    className="h-4 w-4 text-amber-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Eyes (default #f2e2bb)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={fixTeeth}
                    onChange={(e) => setFixTeeth(e.target.checked)}
                    disabled={isFixing}
                    className="h-4 w-4 text-amber-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Teeth (default #FFFFFF)</span>
                </label>
              </div>
              {fixError && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">{fixError}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFixTransparency();
                  }}
                  disabled={isFixing || (!fixEyes && !fixTeeth)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isFixing ? 'Applying...' : 'Apply'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFixTransparencyPanel(false);
                    setFixError(null);
                  }}
                  disabled={isFixing}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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

