'use client';

import { useState } from 'react';
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
 */
export function MultipleErrorsBadge({ errors, className = '' }: MultipleErrorsBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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

  const errorList = errors.map(error => ({
    type: error,
    label: StatusLabels[error] || error,
    description: errorDescriptions[error] || 'Error detected'
  }));

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <AlertTriangle className="h-3 w-3 mr-1" />
        Multiple Errors ({errors.length})
      </button>

      {/* Hover Tooltip */}
      {showTooltip && !showDetails && (
        <div className="absolute z-50 w-64 p-3 mt-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg pointer-events-none">
          <div className="font-semibold mb-2">Multiple Issues Detected:</div>
          <ul className="space-y-1">
            {errorList.map((error, idx) => (
              <li key={idx} className="flex flex-col">
                <span className="font-medium">{error.label}</span>
                <span className="text-xs text-gray-300 mt-0.5">{error.description}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-gray-400 italic">
            Click to view details
          </div>
        </div>
      )}

      {/* Expanded Details Panel */}
      {showDetails && (
        <div className="absolute z-50 w-80 p-4 mt-2 bg-white border-2 border-red-200 rounded-lg shadow-xl">
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
              <div key={idx} className="border-l-4 border-red-400 pl-3">
                <div className="font-medium text-sm text-gray-900">{error.label}</div>
                <div className="text-xs text-gray-600 mt-1">{error.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

