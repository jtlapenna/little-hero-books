/**
 * Phase Constants - Order Phase Organization
 * 
 * This file defines the phase buckets that organize orders by workflow stage.
 * Phases help visualize the order lifecycle and improve navigation.
 * 
 * Last Updated: 2025-01-XX (Task 3)
 */

import { OrderStatus } from './statuses';

/**
 * Order Phase Enum
 * 7-phase system for order lifecycle (including delivery and archive)
 */
export enum OrderPhase {
  IN_QUEUE = 'in_queue', // In Queue / Generating - Grey
  FIRST_REVIEW = 'first_review', // First Review - Blue
  AWAITING_CUSTOMER = 'awaiting_customer', // Awaiting Customer - Purple
  SECOND_REVIEW = 'second_review', // Second Review - Yellow
  SENT_TO_PRINT = 'sent_to_print', // Sent to Print - Green
  RECENTLY_DELIVERED = 'recently_delivered', // Recently Delivered - Teal (assumed delivered, 15-day retention)
  ARCHIVED = 'archived', // Archived - Grey/muted (collapsed by default)
}

/**
 * Map OrderStatus to OrderPhase
 * This determines which phase bucket an order belongs to based on its status
 */
export const STATUS_TO_PHASE: Record<OrderStatus | string, OrderPhase> = {
  // Generation Phase
  [OrderStatus.NEW]: OrderPhase.GENERATION,
  [OrderStatus.PENDING_PROCESSING]: OrderPhase.GENERATION,
  [OrderStatus.QUEUED_FOR_PROCESSING]: OrderPhase.GENERATION,
  [OrderStatus.AI_GENERATION_IN_PROGRESS]: OrderPhase.GENERATION,
  [OrderStatus.AI_GENERATION_COMPLETED]: OrderPhase.REVIEW,
  [OrderStatus.PENDING_BASE_REVIEW]: OrderPhase.REVIEW,
  [OrderStatus.REVISION_BASE]: OrderPhase.REVIEW,
  
  // Assembly Phase
  [OrderStatus.PENDING_BG_REMOVAL]: OrderPhase.ASSEMBLY,
  [OrderStatus.PENDING_BG_REMOVAL_REVIEW]: OrderPhase.REVIEW,
  [OrderStatus.REVISION_BG_REMOVAL]: OrderPhase.REVIEW,
  [OrderStatus.PENDING_ASSEMBLY]: OrderPhase.ASSEMBLY,
  [OrderStatus.PENDING_ASSEMBLY_REVIEW]: OrderPhase.REVIEW,
  [OrderStatus.REVISION_ASSEMBLY]: OrderPhase.REVIEW,
  
  // Customer Approval Phase
  [OrderStatus.PENDING_CUSTOMER_APPROVAL]: OrderPhase.CUSTOMER_APPROVAL,
  [OrderStatus.CUSTOMER_REVISION_REQUESTED]: OrderPhase.CUSTOMER_APPROVAL,
  
  // Production Phase
  [OrderStatus.CUSTOMER_APPROVED]: OrderPhase.PRODUCTION,
  [OrderStatus.PENDING_PRINT]: OrderPhase.PRODUCTION,
  [OrderStatus.PRINT_SUBMISSION_IN_PROGRESS]: OrderPhase.PRODUCTION,
  [OrderStatus.PRINT_SUBMISSION_COMPLETED]: OrderPhase.PRODUCTION,
  [OrderStatus.IN_PRODUCTION]: OrderPhase.PRODUCTION,
  [OrderStatus.PENDING_SHIPPING]: OrderPhase.PRODUCTION,
  
  // Shipping Phase
  [OrderStatus.SHIPPED]: OrderPhase.SHIPPING,
  
  // Completed Phase
  [OrderStatus.DELIVERED]: OrderPhase.COMPLETED,
  [OrderStatus.COMPLETED]: OrderPhase.COMPLETED,
  
  // Failed Phase
  [OrderStatus.ACTION_REQUIRED]: OrderPhase.FAILED,
  [OrderStatus.FAILED]: OrderPhase.FAILED,
  [OrderStatus.CANCELLED]: OrderPhase.FAILED
};

// Note: DISPLAY_STATUS_TO_PHASE mapping is now in status-display.ts
// This file focuses on OrderPhase constants and OrderStatus to OrderPhase mapping

/**
 * Phase Display Labels
 */
export const PhaseLabels: Record<OrderPhase, string> = {
  [OrderPhase.IN_QUEUE]: 'In Queue',
  [OrderPhase.FIRST_REVIEW]: 'First Review',
  [OrderPhase.AWAITING_CUSTOMER]: 'Awaiting Customer',
  [OrderPhase.SECOND_REVIEW]: 'Second Review',
  [OrderPhase.SENT_TO_PRINT]: 'Sent to Print',
  [OrderPhase.RECENTLY_DELIVERED]: 'Recently Delivered',
  [OrderPhase.ARCHIVED]: 'Archived',
};

/**
 * Phase Descriptions
 */
export const PhaseDescriptions: Record<OrderPhase, string> = {
  [OrderPhase.IN_QUEUE]: 'Order submitted, character generation in progress',
  [OrderPhase.FIRST_REVIEW]: 'First review process - flagging, revising, approving',
  [OrderPhase.AWAITING_CUSTOMER]: 'Proof sent to customer, awaiting response',
  [OrderPhase.SECOND_REVIEW]: 'Second review after customer revision request',
  [OrderPhase.SENT_TO_PRINT]: 'Order sent to print production',
  [OrderPhase.RECENTLY_DELIVERED]: 'Assumed delivered, auto-archives after 15 days',
  [OrderPhase.ARCHIVED]: 'Archived orders (searchable but inactive)',
};

/**
 * Phase Colors
 * Colors for phase badges and UI elements
 */
export const PhaseColors: Record<OrderPhase, {
  bg: string;
  text: string;
  border: string;
  icon: string;
}> = {
  [OrderPhase.IN_QUEUE]: {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    icon: '⏳' // Hourglass for in queue
  },
  [OrderPhase.FIRST_REVIEW]: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: '👁️' // Eye for first review
  },
  [OrderPhase.AWAITING_CUSTOMER]: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: '✋' // Hand for awaiting customer
  },
  [OrderPhase.SECOND_REVIEW]: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: '🔍' // Magnifying glass for second review
  },
  [OrderPhase.SENT_TO_PRINT]: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: '🖨️' // Printer for sent to print
  },
  [OrderPhase.RECENTLY_DELIVERED]: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    icon: '📦' // Package for recently delivered
  },
  [OrderPhase.ARCHIVED]: {
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    border: 'border-slate-200',
    icon: '🗄️' // File cabinet for archived
  }
};

/**
 * Phase Order
 * The order in which phases appear in the phase summary UI.
 * Note: RECENTLY_DELIVERED and ARCHIVED are shown in separate collapsible sections,
 * so they are NOT included here.
 */
export const PHASE_ORDER: OrderPhase[] = [
  OrderPhase.IN_QUEUE,
  OrderPhase.FIRST_REVIEW,
  OrderPhase.AWAITING_CUSTOMER,
  OrderPhase.SECOND_REVIEW,
  OrderPhase.SENT_TO_PRINT,
];

/**
 * Active Phases (excludes recently_delivered and archived)
 * Used for filtering active orders in the main view
 */
export const ACTIVE_PHASE_ORDER: OrderPhase[] = [
  OrderPhase.IN_QUEUE,
  OrderPhase.FIRST_REVIEW,
  OrderPhase.AWAITING_CUSTOMER,
  OrderPhase.SECOND_REVIEW,
  OrderPhase.SENT_TO_PRINT,
];

/**
 * Get phase for a given status
 * Note: This is a legacy function. Use getPhaseForOrder in status-display.ts instead
 * which considers revisionCount to determine first vs second review
 */
export function getPhaseForStatus(status: string): OrderPhase {
  return STATUS_TO_PHASE[status] || OrderPhase.IN_QUEUE;
}

/**
 * Get phase label
 */
export function getPhaseLabel(phase: OrderPhase): string {
  return PhaseLabels[phase] || phase;
}

/**
 * Get phase description
 */
export function getPhaseDescription(phase: OrderPhase): string {
  return PhaseDescriptions[phase] || '';
}

/**
 * Get phase colors
 */
export function getPhaseColors(phase: OrderPhase) {
  return PhaseColors[phase] || PhaseColors[OrderPhase.IN_QUEUE];
}

/**
 * Group orders by phase
 * Note: Orders should have their phase set by buildOrderListItem which calls getDisplayStatusForOrder
 * This function uses order.phase if available, otherwise falls back to IN_QUEUE
 */
export function groupOrdersByPhase<T extends { status?: string; phase?: OrderPhase; revisionCount?: number; lifecycle_status?: string }>(orders: T[]): Record<OrderPhase, T[]> {
  const grouped: Record<OrderPhase, T[]> = {
    [OrderPhase.IN_QUEUE]: [],
    [OrderPhase.FIRST_REVIEW]: [],
    [OrderPhase.AWAITING_CUSTOMER]: [],
    [OrderPhase.SECOND_REVIEW]: [],
    [OrderPhase.SENT_TO_PRINT]: [],
    [OrderPhase.RECENTLY_DELIVERED]: [],
    [OrderPhase.ARCHIVED]: [],
  };
  
  orders.forEach(order => {
    // Check lifecycle_status first for recently_delivered and archived orders
    if (order.lifecycle_status === 'recently_delivered') {
      grouped[OrderPhase.RECENTLY_DELIVERED].push(order);
      return;
    }
    if (order.lifecycle_status === 'archived') {
      grouped[OrderPhase.ARCHIVED].push(order);
      return;
    }
    
    // Use order.phase if available (should be set by buildOrderListItem)
    // Otherwise fallback to IN_QUEUE
    const phase = order.phase || OrderPhase.IN_QUEUE;
    grouped[phase].push(order);
  });
  
  return grouped;
}

/**
 * Get phase counts
 */
export function getPhaseCounts<T extends { status?: string; phase?: OrderPhase; revisionCount?: number; lifecycle_status?: string }>(orders: T[]): Record<OrderPhase, number> {
  const grouped = groupOrdersByPhase(orders);
  return {
    [OrderPhase.IN_QUEUE]: grouped[OrderPhase.IN_QUEUE].length,
    [OrderPhase.FIRST_REVIEW]: grouped[OrderPhase.FIRST_REVIEW].length,
    [OrderPhase.AWAITING_CUSTOMER]: grouped[OrderPhase.AWAITING_CUSTOMER].length,
    [OrderPhase.SECOND_REVIEW]: grouped[OrderPhase.SECOND_REVIEW].length,
    [OrderPhase.SENT_TO_PRINT]: grouped[OrderPhase.SENT_TO_PRINT].length,
    [OrderPhase.RECENTLY_DELIVERED]: grouped[OrderPhase.RECENTLY_DELIVERED].length,
    [OrderPhase.ARCHIVED]: grouped[OrderPhase.ARCHIVED].length,
  };
}

