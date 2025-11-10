'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { OrderPhase, getPhaseLabel, getPhaseDescription, getPhaseColors } from '@/constants/phases';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface PhaseBucketProps<T> {
  phase: OrderPhase;
  orders: T[];
  renderOrder: (order: T, index: number) => React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  customLabel?: string;
  customDescription?: string;
}

/**
 * PhaseBucket Component
 * 
 * Displays a collapsible bucket of orders grouped by phase.
 * Shows phase header with count, icon, and description.
 * 
 * @param phase - The phase this bucket represents
 * @param orders - Array of orders in this phase
 * @param renderOrder - Function to render each order
 * @param defaultExpanded - Whether bucket starts expanded (default: true)
 * @param className - Additional CSS classes
 */
export function PhaseBucket<T extends { status?: string; phase?: OrderPhase }>({
  phase,
  orders,
  renderOrder,
  defaultExpanded = true,
  className,
  customLabel,
  customDescription
}: PhaseBucketProps<T>) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const phaseLabel = customLabel || getPhaseLabel(phase);
  const phaseDescription = customDescription || getPhaseDescription(phase);
  const colors = getPhaseColors(phase);
  const count = orders.length;

  if (count === 0) {
    return null; // Don't render empty buckets
  }

  return (
    <div className={cn('border rounded-lg overflow-hidden', colors.border, className)}>
      {/* Phase Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full px-4 py-3 flex items-center justify-between',
          'hover:opacity-90 transition-opacity',
          colors.bg,
          colors.text
        )}
      >
        <div className="flex items-center space-x-3">
          <span className="text-lg">{colors.icon}</span>
          <div className="text-left">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold">{phaseLabel}</h3>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                colors.bg,
                colors.text,
                colors.border,
                'border'
              )}>
                {count} {count === 1 ? 'order' : 'orders'}
              </span>
            </div>
            <p className="text-xs opacity-75 mt-0.5">{phaseDescription}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Phase Content */}
      {isExpanded && (
        <div className="bg-white divide-y divide-gray-200">
          {orders.map((order, index) => (
            <div key={index}>
              {renderOrder(order, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

