import { DisplayStatus, OrderStatus } from '@/constants/statuses';
import { isGelatoStatus } from './gelato-status';

export interface GelatoTracking {
  providerOrderId: string; packageId: string; providerItemIds: string[];
  trackingNumber: string; trackingUrl: string; carrier: string; quantity: number;
}
export function gelatoOrderStatus(status?: string | null, type?: string | null, reason?: string | null): OrderStatus | null {
  if (reason && reason !== 'awaiting_draft_review') return OrderStatus.ACTION_REQUIRED;
  if (type === 'draft') return OrderStatus.PENDING_PRINT;
  if (!status) return null;
  if (status === 'canceled') return OrderStatus.CANCELLED;
  if (['failed', 'returned', 'on_hold', 'digitizing'].includes(status) || !isGelatoStatus(status)) return OrderStatus.ACTION_REQUIRED;
  if (status === 'delivered') return OrderStatus.DELIVERED;
  if (status === 'shipped' || status === 'in_transit') return OrderStatus.SHIPPED;
  if (status === 'in_production' || status === 'printed') return OrderStatus.IN_PRODUCTION;
  return OrderStatus.PENDING_PRINT;
}
export function gelatoDisplayStatus(status?: string | null, type?: string | null, reason?: string | null): DisplayStatus | null {
  if (reason && reason !== 'awaiting_draft_review') return DisplayStatus.ACTION_REQUIRED;
  if (type === 'draft') return DisplayStatus.PRINT_DRAFT;
  const value = gelatoOrderStatus(status, type, reason);
  if (!value) return null;
  return ({ [OrderStatus.DELIVERED]: DisplayStatus.DELIVERED, [OrderStatus.SHIPPED]: DisplayStatus.SHIPPED,
    [OrderStatus.IN_PRODUCTION]: DisplayStatus.PRINTING, [OrderStatus.PENDING_PRINT]: DisplayStatus.PREPARING_PRINT } as Partial<Record<OrderStatus, DisplayStatus>>)[value] ?? DisplayStatus.ACTION_REQUIRED;
}
export function gelatoCustomerStatusMessage(status?: string | null, type?: string | null, reason?: string | null) {
  const value = gelatoOrderStatus(status, type, reason);
  if (value === OrderStatus.DELIVERED) return { short: 'Delivered', long: 'Your book has been delivered.', icon: '📦', color: 'green' };
  if (value === OrderStatus.SHIPPED) return { short: 'Shipped', long: 'Your book is with the carrier.', icon: '📦', color: 'green' };
  if (value === OrderStatus.IN_PRODUCTION) return { short: 'Printing', long: 'Your book is being printed.', icon: '📖', color: 'blue' };
  if (value === OrderStatus.CANCELLED) return { short: 'Canceled', long: 'Printing has been canceled.', icon: '', color: 'gray' };
  if (value === OrderStatus.ACTION_REQUIRED) return { short: 'Order update needed', long: 'We are checking your print order.', icon: '', color: 'orange' };
  return { short: 'Preparing for Print', long: 'Your book is being prepared. Printing has not started.', icon: '⏳', color: 'blue' };
}
