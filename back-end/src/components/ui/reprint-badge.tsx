import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReprintBadgeProps {
  count: number;
  reason?: string;
  note?: string;
  className?: string;
}

/**
 * Purpose: show that an order has been reprinted (count > 0).
 */
export function ReprintBadge({ count, reason, note, className }: ReprintBadgeProps) {
  if (!Number.isFinite(count) || count <= 0) return null;

  const titleParts = [
    `Reprint count: ${count}`,
    reason ? `Reason: ${reason}` : null,
    note ? `Note: ${note}` : null,
  ].filter(Boolean);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        'bg-sky-100 text-sky-900 border-sky-200',
        className
      )}
      title={titleParts.join('\n')}
    >
      <RotateCcw className="h-3 w-3 mr-1" />
      {count > 1 ? `Reprint ×${count}` : 'Reprint'}
    </span>
  );
}

