import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlaggedBadgeProps {
  count: number;
  className?: string;
  showZero?: boolean;
}

/**
 * FlaggedBadge Component
 * 
 * Displays a badge showing the number of flagged items.
 * Only shows when count > 0 (unless showZero is true).
 * 
 * @param count - Number of flagged items
 * @param className - Additional CSS classes
 * @param showZero - Whether to show badge when count is 0 (default: false)
 */
export function FlaggedBadge({ count, className, showZero = false }: FlaggedBadgeProps) {
  if (count === 0 && !showZero) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        'bg-orange-100 text-orange-800 border-orange-200',
        className
      )}
      title={`${count} flagged item${count !== 1 ? 's' : ''}`}
    >
      <Flag className="h-3 w-3 mr-1" />
      {count} Flagged
    </span>
  );
}

