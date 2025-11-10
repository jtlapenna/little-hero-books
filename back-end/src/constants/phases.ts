/**
 * Phase Constants - Order Phase Organization
 * 
 * This file defines the phase buckets that organize orders by workflow stage.
 * Phases help visualize the order lifecycle and improve navigation.
 * 
 * Last Updated: 2025-01-XX (Task 3)
 */

import { DisplayStatus, OrderStatus } from './statuses';

/**
 * Order Phase Enum
 * Logical phases that orders go through in the workflow
 */
export enum OrderPhase {
  GENERATION = 'generation', // AI generation, character creation
  REVIEW = 'review', // Human review, approval
  ASSEMBLY = 'assembly', // Book assembly, PDF creation
  CUSTOMER_APPROVAL = 'customer_approval', // Customer preview/approval
  PRODUCTION = 'production', // Print submission, production
  SHIPPING = 'shipping', // Shipped, delivered
  COMPLETED = 'completed', // Delivered, fulfilled
  FAILED = 'failed' // Failed, cancelled
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

const DISPLAY_STATUS_TO_PHASE: Record<DisplayStatus, OrderPhase> = {
  [DisplayStatus.NEW]: OrderPhase.GENERATION,
  [DisplayStatus.PENDING]: OrderPhase.REVIEW,
  [DisplayStatus.APPROVED]: OrderPhase.REVIEW,
  [DisplayStatus.PROOF_SENT]: OrderPhase.CUSTOMER_APPROVAL,
  [DisplayStatus.CORRECTION_REQUESTED]: OrderPhase.CUSTOMER_APPROVAL,
  [DisplayStatus.SENT_TO_PRINT]: OrderPhase.PRODUCTION,
  [DisplayStatus.SHIPPED]: OrderPhase.SHIPPING,
  [DisplayStatus.DELIVERED]: OrderPhase.COMPLETED,
  [DisplayStatus.ACTION_REQUIRED]: OrderPhase.FAILED
};

/**
 * Phase Display Labels
 */
export const PhaseLabels: Record<OrderPhase, string> = {
  [OrderPhase.GENERATION]: 'Generation',
  [OrderPhase.REVIEW]: 'Review',
  [OrderPhase.ASSEMBLY]: 'Assembly',
  [OrderPhase.CUSTOMER_APPROVAL]: 'Customer Approval',
  [OrderPhase.PRODUCTION]: 'Production',
  [OrderPhase.SHIPPING]: 'Shipping',
  [OrderPhase.COMPLETED]: 'Completed',
  [OrderPhase.FAILED]: 'Failed'
};

/**
 * Phase Descriptions
 */
export const PhaseDescriptions: Record<OrderPhase, string> = {
  [OrderPhase.GENERATION]: 'AI character generation and asset creation',
  [OrderPhase.REVIEW]: 'Human review and quality approval',
  [OrderPhase.ASSEMBLY]: 'Book assembly and PDF generation',
  [OrderPhase.CUSTOMER_APPROVAL]: 'Customer preview and approval',
  [OrderPhase.PRODUCTION]: 'Print submission and production',
  [OrderPhase.SHIPPING]: 'Order shipped to customer',
  [OrderPhase.COMPLETED]: 'Order delivered and fulfilled',
  [OrderPhase.FAILED]: 'Failed or cancelled orders'
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
  [OrderPhase.GENERATION]: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: '⚡' // Lightning bolt for generation
  },
  [OrderPhase.REVIEW]: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: '👁️' // Eye for review
  },
  [OrderPhase.ASSEMBLY]: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    icon: '📚' // Books for assembly
  },
  [OrderPhase.CUSTOMER_APPROVAL]: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: '✋' // Hand for customer approval
  },
  [OrderPhase.PRODUCTION]: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: '🏭' // Factory for production
  },
  [OrderPhase.SHIPPING]: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: '🚚' // Truck for shipping
  },
  [OrderPhase.COMPLETED]: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: '✅' // Checkmark for completed
  },
  [OrderPhase.FAILED]: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: '❌' // X for failed
  }
};

/**
 * Phase Order
 * The order in which phases appear in the UI
 */
export const PHASE_ORDER: OrderPhase[] = [
  OrderPhase.GENERATION,
  OrderPhase.REVIEW,
  OrderPhase.ASSEMBLY,
  OrderPhase.CUSTOMER_APPROVAL,
  OrderPhase.PRODUCTION,
  OrderPhase.SHIPPING,
  OrderPhase.COMPLETED,
  OrderPhase.FAILED
];

/**
 * Get phase for a given status
 */
export function getPhaseForStatus(status: string): OrderPhase {
  return STATUS_TO_PHASE[status] || OrderPhase.GENERATION;
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
  return PhaseColors[phase] || PhaseColors[OrderPhase.GENERATION];
}

/**
 * Group orders by phase
 */
export function groupOrdersByPhase<T extends { status?: string; phase?: OrderPhase }>(orders: T[]): Record<OrderPhase, T[]> {
  const grouped: Record<OrderPhase, T[]> = {
    [OrderPhase.GENERATION]: [],
    [OrderPhase.REVIEW]: [],
    [OrderPhase.ASSEMBLY]: [],
    [OrderPhase.CUSTOMER_APPROVAL]: [],
    [OrderPhase.PRODUCTION]: [],
    [OrderPhase.SHIPPING]: [],
    [OrderPhase.COMPLETED]: [],
    [OrderPhase.FAILED]: []
  };
  
  orders.forEach(order => {
    let phase: OrderPhase;
    if (order.phase) {
      phase = order.phase;
    } else if (order.status && DISPLAY_STATUS_TO_PHASE[order.status as DisplayStatus]) {
      phase = DISPLAY_STATUS_TO_PHASE[order.status as DisplayStatus];
    } else if (order.status) {
      phase = getPhaseForStatus(order.status);
    } else {
      phase = OrderPhase.GENERATION;
    }
    grouped[phase].push(order);
  });
  
  return grouped;
}

/**
 * Get phase counts
 */
export function getPhaseCounts<T extends { status?: string; phase?: OrderPhase }>(orders: T[]): Record<OrderPhase, number> {
  const grouped = groupOrdersByPhase(orders);
  return {
    [OrderPhase.GENERATION]: grouped[OrderPhase.GENERATION].length,
    [OrderPhase.REVIEW]: grouped[OrderPhase.REVIEW].length,
    [OrderPhase.ASSEMBLY]: grouped[OrderPhase.ASSEMBLY].length,
    [OrderPhase.CUSTOMER_APPROVAL]: grouped[OrderPhase.CUSTOMER_APPROVAL].length,
    [OrderPhase.PRODUCTION]: grouped[OrderPhase.PRODUCTION].length,
    [OrderPhase.SHIPPING]: grouped[OrderPhase.SHIPPING].length,
    [OrderPhase.COMPLETED]: grouped[OrderPhase.COMPLETED].length,
    [OrderPhase.FAILED]: grouped[OrderPhase.FAILED].length
  };
}

