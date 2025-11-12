'use client';

import { OrderPhase, getPhaseLabel, getPhaseColors, getPhaseCounts, PHASE_ORDER } from '@/constants/phases';
import { cn } from '@/lib/utils';

interface PhaseSummaryProps<T extends { status?: string; phase?: OrderPhase }> {
  orders: T[];
  onPhaseClick?: (phase: OrderPhase) => void;
  showEmptyPhases?: boolean;
  className?: string;
}

/**
 * PhaseSummary Component
 * 
 * Displays a summary of order counts by phase with visual indicators.
 * Can be used as a navigation bar or summary widget.
 * 
 * @param orders - Array of orders to summarize
 * @param onPhaseClick - Optional callback when a phase is clicked
 * @param showEmptyPhases - Whether to show phases with 0 orders (default: false)
 * @param className - Additional CSS classes
 */
export function PhaseSummary<T extends { status?: string; phase?: OrderPhase }>({
  orders,
  onPhaseClick,
  showEmptyPhases = false,
  className
}: PhaseSummaryProps<T>) {
  const phaseCounts = getPhaseCounts(orders);
  const total = orders.length;

  return (
    <div className={cn('bg-white rounded-lg shadow-sm border border-gray-200 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Orders by Phase</h3>
        <span className="text-sm text-gray-500">Total: {total}</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {PHASE_ORDER.map((phase) => {
          const count = phaseCounts[phase];
          const colors = getPhaseColors(phase);
          const label = getPhaseLabel(phase);
          
          if (!showEmptyPhases && count === 0) {
            return null;
          }
          
          return (
            <button
              key={phase}
              onClick={() => onPhaseClick?.(phase)}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                'hover:shadow-md hover:scale-105',
                count > 0 ? colors.border : 'border-gray-200',
                count > 0 ? colors.bg : 'bg-gray-50',
                onPhaseClick && count > 0 ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{colors.icon}</span>
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-bold',
                  count > 0 ? colors.text : 'text-gray-400',
                  count > 0 ? colors.bg : 'bg-gray-100'
                )}>
                  {count}
                </span>
              </div>
              <p className={cn(
                'text-xs font-medium text-left',
                count > 0 ? colors.text : 'text-gray-400'
              )}>
                {label}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PhaseSummaryCompact Component
 * 
 * A more compact version of PhaseSummary for smaller spaces
 */
export function PhaseSummaryCompact<T extends { status?: string; phase?: OrderPhase }>({
  orders,
  onPhaseClick,
  className
}: PhaseSummaryProps<T>) {
  const phaseCounts = getPhaseCounts(orders);
  const total = orders.length;

  return (
    <div className={cn('flex items-center space-x-4 overflow-x-auto', className)}>
      {PHASE_ORDER.map((phase) => {
        const count = phaseCounts[phase];
        const colors = getPhaseColors(phase);
        const label = getPhaseLabel(phase);
        
        if (count === 0) {
          return null;
        }
        
        return (
          <button
            key={phase}
            onClick={() => onPhaseClick?.(phase)}
            className={cn(
              'flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all',
              'hover:shadow-md whitespace-nowrap',
              colors.border,
              colors.bg,
              onPhaseClick ? 'cursor-pointer' : 'cursor-default'
            )}
          >
            <span>{colors.icon}</span>
            <span className={cn('font-semibold text-sm', colors.text)}>{label}</span>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-xs font-bold',
              colors.text,
              colors.bg
            )}>
              {count}
            </span>
          </button>
        );
      })}
      <div className="text-sm text-gray-500 ml-auto">
        Total: <span className="font-semibold">{total}</span>
      </div>
    </div>
  );
}

