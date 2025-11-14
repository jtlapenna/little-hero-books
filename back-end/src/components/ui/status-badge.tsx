import { cn } from '@/lib/utils';
import { getStatusLabel, getStatusColors, DisplayStatus } from '@/constants/statuses';
import { MultipleErrorsBadge } from './multiple-errors-badge';

interface StatusBadgeProps {
  status: string;
  className?: string;
  showTooltip?: boolean;
  revisionCount?: number; // Used to determine if we're in second review (yellow) vs first review (blue)
  errors?: DisplayStatus[]; // Array of errors for multiple errors badge
}

/**
 * StatusBadge Component
 * 
 * Displays a standardized status badge using the centralized status constants.
 * All status values should come from the statuses.ts constants file.
 * 
 * If status is MULTIPLE_ERRORS and errors array is provided, shows MultipleErrorsBadge.
 * Otherwise shows standard badge.
 * 
 * @param status - Status value (should be from OrderStatus, ReviewStageStatus, etc.)
 * @param className - Additional CSS classes
 * @param showTooltip - Whether to show tooltip on hover (future enhancement)
 * @param revisionCount - Revision count to determine if we're in second review (yellow) vs first review (blue)
 * @param errors - Array of error types (for multiple errors badge)
 */
export function StatusBadge({ status, className, showTooltip = false, revisionCount, errors }: StatusBadgeProps) {
  // If status is MULTIPLE_ERRORS and errors array is provided, show MultipleErrorsBadge
  if (status === DisplayStatus.MULTIPLE_ERRORS && errors && errors.length > 0) {
    return <MultipleErrorsBadge errors={errors} className={className} />;
  }

  const label = getStatusLabel(status, revisionCount);
  const colors = getStatusColors(status, revisionCount);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
      title={showTooltip ? label : undefined}
    >
      {label}
    </span>
  );
}
