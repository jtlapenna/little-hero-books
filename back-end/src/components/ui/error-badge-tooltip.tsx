'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { DisplayStatus, StatusLabels } from '@/constants/statuses';

interface ErrorBadgeTooltipProps {
  errorType: DisplayStatus;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Error Badge Tooltip Component
 * 
 * Simple tooltip component for individual error badges.
 * Shows error description on hover.
 */
export function ErrorBadgeTooltip({ errorType, className = '', children }: ErrorBadgeTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const errorDescriptions: Record<DisplayStatus, string> = {
    [DisplayStatus.MISSING_MANIFEST]: 'Missing required manifest file (1-manifest.json)',
    [DisplayStatus.MAX_RETRIES]: 'Maximum retry attempts (3) exceeded',
    [DisplayStatus.WORKFLOW_TIMEOUT]: 'Workflow timed out after multiple attempts',
    [DisplayStatus.API_ERROR]: 'API request failed',
    [DisplayStatus.STUCK_PROCESSING]: 'Order stuck in processing state for over 30 minutes',
    [DisplayStatus.NOT_PICKED_UP]: 'Order ready for processing but not picked up by router for over 60 minutes',
    [DisplayStatus.MULTIPLE_ERRORS]: 'Multiple errors detected',
    [DisplayStatus.ACTION_REQUIRED]: 'Action required',
    [DisplayStatus.MANUAL_REVIEW_REQUIRED]: 'Manual review required',
  } as Record<DisplayStatus, string>;

  const description = errorDescriptions[errorType] || 'Error detected';
  const label = StatusLabels[errorType] || errorType;

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {children || (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            {label}
          </span>
        )}
      </div>

      {showTooltip && (
        <div className="absolute z-50 w-64 p-3 mt-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg pointer-events-none">
          <div className="font-semibold mb-1">{label}</div>
          <div className="text-xs text-gray-300">{description}</div>
        </div>
      )}
    </div>
  );
}

