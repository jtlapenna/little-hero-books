'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DisplayStatus, StatusLabels } from '@/constants/statuses';

interface MultipleErrorsBadgeProps {
  errors: DisplayStatus[];
  className?: string;
}

/**
 * Multiple Errors Badge Component
 * 
 * Shows "Multiple Errors" badge with hover tooltip displaying all error types.
 * On click, expands error details panel (optional).
 * Tooltip uses fixed positioning to appear above table overflow.
 */
export function MultipleErrorsBadge({ errors, className = '' }: MultipleErrorsBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLButtonElement>(null);

  if (!errors || errors.length === 0) {
    return null;
  }

  // Get error descriptions
  const errorDescriptions: Record<DisplayStatus, string> = {
    [DisplayStatus.MISSING_MANIFEST]: 'Missing required manifest file (1-manifest.json)',
    [DisplayStatus.MAX_RETRIES]: 'Maximum retry attempts (3) exceeded',
    [DisplayStatus.WORKFLOW_TIMEOUT]: 'Workflow timed out after multiple attempts',
    [DisplayStatus.API_ERROR]: 'API request failed',
    [DisplayStatus.STUCK_PROCESSING]: 'Order stuck in processing state for over 30 minutes',
    [DisplayStatus.NOT_PICKED_UP]: 'Order ready for processing but not picked up by router for over 60 minutes',
    [DisplayStatus.MULTIPLE_ERRORS]: 'Multiple errors detected',
    // Add fallbacks for other statuses
    [DisplayStatus.ACTION_REQUIRED]: 'Action required',
    [DisplayStatus.MANUAL_REVIEW_REQUIRED]: 'Manual review required',
  } as Record<DisplayStatus, string>;

  // Deduplicate errors by type
  const uniqueErrors = Array.from(new Set(errors));
  const errorList = uniqueErrors.map(error => ({
    type: error,
    label: StatusLabels[error] || error,
    description: errorDescriptions[error] || 'Error detected'
  }));

  // Calculate tooltip position when showing
  // Using fixed positioning (relative to viewport), so no need to add scroll offsets
  useEffect(() => {
    if ((showTooltip || showDetails) && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + 8, // 8px gap below badge
        left: rect.left
      });
    }
  }, [showTooltip, showDetails]);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={badgeRef}
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <AlertTriangle className="h-3 w-3 mr-1" />
        Multiple Errors ({errors.length})
      </button>

      {/* Hover Tooltip - Fixed positioning to appear above table overflow */}
      {showTooltip && !showDetails && (
        <div 
          className="fixed z-[99999] max-w-md min-w-64 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            pointerEvents: 'auto',
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="font-semibold mb-2 break-words">Multiple Issues Detected:</div>
          <ul className="space-y-1">
            {errorList.map((error, idx) => (
              <li key={idx} className="flex flex-col break-words">
                <span className="font-medium break-words">{error.label}</span>
                <span className="text-xs text-gray-300 mt-0.5 break-words">{error.description}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-gray-400 italic">
            Click badge to view details
          </div>
        </div>
      )}

      {/* Expanded Details Panel - Fixed positioning to appear above table overflow */}
      {showDetails && badgeRef.current && (
        <div 
          className="fixed z-[99999] max-w-lg min-w-80 p-4 bg-white border-2 border-red-200 rounded-lg shadow-xl"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            pointerEvents: 'auto',
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Error Details ({errors.length} issues)
            </h3>
            <button
              onClick={() => setShowDetails(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="space-y-3">
            {errorList.map((error, idx) => (
              <div key={idx} className="border-l-4 border-red-400 pl-3 break-words">
                <div className="font-medium text-sm text-gray-900 break-words">{error.label}</div>
                <div className="text-xs text-gray-600 mt-1 break-words">{error.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

