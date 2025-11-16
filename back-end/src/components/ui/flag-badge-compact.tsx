import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlagBadgeCompactProps {
  count: number;
  className?: string;
  variant?: 'default' | 'active';
}

/**
 * Compact flag badge for tabs
 * Shows just the flag icon and number (no "Flagged" text)
 */
export function FlagBadgeCompact({ count, className, variant = 'default' }: FlagBadgeCompactProps) {
  if (count === 0) {
    return null;
  }

  const variantStyles = {
    default: 'bg-orange-50 text-orange-700 border-orange-200',
    active: 'bg-orange-100 text-orange-800 border-orange-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-xs font-semibold border',
        variantStyles[variant],
        className
      )}
      title={`${count} flagged item${count !== 1 ? 's' : ''}`}
    >
      <Flag className="h-3 w-3" />
      <span>{count}</span>
    </span>
  );
}

