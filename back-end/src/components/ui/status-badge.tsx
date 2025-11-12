import { cn } from '@/lib/utils';
import { getStatusLabel, getStatusColors } from '@/constants/statuses';

interface StatusBadgeProps {
  status: string;
  className?: string;
  showTooltip?: boolean;
  revisionCount?: number; // Used to determine if we're in second review (yellow) vs first review (blue)
}

/**
 * StatusBadge Component
 * 
 * Displays a standardized status badge using the centralized status constants.
 * All status values should come from the statuses.ts constants file.
 * 
 * @param status - Status value (should be from OrderStatus, ReviewStageStatus, etc.)
 * @param className - Additional CSS classes
 * @param showTooltip - Whether to show tooltip on hover (future enhancement)
 * @param revisionCount - Revision count to determine if we're in second review (yellow) vs first review (blue)
 */
export function StatusBadge({ status, className, showTooltip = false, revisionCount }: StatusBadgeProps) {
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
