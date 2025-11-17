import { cn } from '@/lib/utils';

interface CountBadgeProps {
  count: number;
  className?: string;
  variant?: 'default' | 'active' | 'muted';
}

/**
 * Compact count badge for tabs
 * Shows just the number in a small, elegant badge
 */
export function CountBadge({ count, className, variant = 'default' }: CountBadgeProps) {
  if (count === 0) {
    return null;
  }

  const variantStyles = {
    default: 'bg-gray-100 text-gray-700',
    active: 'bg-blue-100 text-blue-700',
    muted: 'bg-gray-50 text-gray-500',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-xs font-semibold',
        variantStyles[variant],
        className
      )}
    >
      {count}
    </span>
  );
}

