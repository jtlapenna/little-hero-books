import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'pending' | 'in-review' | 'in_review' | 'approved' | 'completed' | 'rejected' | 'queued_for_processing' | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig = {
    pending: {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    },
    'in-review': {
      label: 'In Review',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    'in_review': {
      label: 'In Review',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    approved: {
      label: 'Approved',
      className: 'bg-green-100 text-green-800 border-green-200'
    },
    completed: {
      label: 'Completed',
      className: 'bg-green-100 text-green-800 border-green-200'
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800 border-red-200'
    },
    'queued_for_processing': {
      label: 'Queued',
      className: 'bg-gray-100 text-gray-800 border-gray-200'
    }
  };

  const config = (statusConfig as any)[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
