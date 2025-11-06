import { cn } from '@/lib/utils';
import { getStatusLabel, getStatusColors } from '@/constants/statuses';

interface StatusBadgeProps {
  status: string;
  className?: string;
  showTooltip?: boolean;
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
 */
export function StatusBadge({ status, className, showTooltip = false }: StatusBadgeProps) {
  const label = getStatusLabel(status);
  const colors = getStatusColors(status);

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
