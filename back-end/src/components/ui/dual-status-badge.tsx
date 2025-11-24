import { cn } from '@/lib/utils';
import { DisplayStatus } from '@/constants/statuses';
import { StatusBadge } from './status-badge';

interface DualStatusBadgeProps {
  workflowStatus: DisplayStatus;
  technicalStatus?: DisplayStatus;
  revisionCount?: number;
  errors?: DisplayStatus[];
  className?: string;
  layout?: 'horizontal' | 'vertical'; // For responsive layouts
}

/**
 * DualStatusBadge Component
 * 
 * Displays both workflow status (primary) and technical status (secondary).
 * Workflow status is always shown, technical status only appears when issues exist.
 * 
 * @param workflowStatus - Where the order is in the production workflow (always shown)
 * @param technicalStatus - Technical issues/errors (only shown when present)
 * @param revisionCount - Revision count for color coding (yellow for second review)
 * @param errors - Array of error types (for multiple errors badge)
 * @param className - Additional CSS classes
 * @param layout - Layout direction (horizontal by default, vertical for mobile)
 */
export function DualStatusBadge({ 
  workflowStatus, 
  technicalStatus, 
  revisionCount, 
  errors,
  className,
  layout = 'horizontal'
}: DualStatusBadgeProps) {
  const containerClass = layout === 'horizontal' 
    ? 'inline-flex items-center gap-2'
    : 'flex flex-col items-start gap-1';

  return (
    <div className={cn(containerClass, className)}>
      {/* Primary: Workflow Status (always shown) */}
      <StatusBadge 
        status={workflowStatus} 
        revisionCount={revisionCount}
      />
      
      {/* Secondary: Technical Status (only if issues exist) */}
      {technicalStatus && (
        <StatusBadge 
          status={technicalStatus}
          errors={errors}
        />
      )}
    </div>
  );
}

