import type { Order, SiblingOrderSummary } from '@/types/order';
import { parseSiblingItemNumber, splitName } from '@/lib/order-mapper';

type SiblingRow = Record<string, any>;

function toSiblingSummary(
  row: SiblingRow,
  currentOrderId: string
): SiblingOrderSummary | null {
  const orderId = String(row.orderId ?? row.order_id ?? row.amazon_order_id ?? '').trim();
  if (!orderId) return null;

  const { firstName, lastName } = splitName(
    row.customer_name,
    typeof row.child_name === 'string' ? row.child_name : 'Customer Unknown'
  );

  return {
    orderId,
    displayOrderId:
      typeof row.display_order_id === 'string' && row.display_order_id.trim().length > 0
        ? row.display_order_id
        : undefined,
    itemNumber: parseSiblingItemNumber(orderId),
    isCurrent: orderId === currentOrderId,
    executionStatus:
      typeof row.execution_status === 'string' && row.execution_status.trim().length > 0
        ? row.execution_status
        : undefined,
    workflowStep:
      typeof row.workflow_step === 'string' && row.workflow_step.trim().length > 0
        ? row.workflow_step
        : undefined,
    nextWorkflow:
      typeof row.next_workflow === 'string' && row.next_workflow.trim().length > 0
        ? row.next_workflow
        : undefined,
    manifest2aUrl:
      typeof row.manifest_2a_url === 'string' && row.manifest_2a_url.trim().length > 0
        ? row.manifest_2a_url
        : undefined,
    characterHash:
      typeof row.character_hash === 'string' && row.character_hash.trim().length > 0
        ? row.character_hash
        : undefined,
    customer: {
      firstName,
      lastName,
    },
  };
}

export function buildSiblingOrderSummaries(
  currentOrder: Order,
  siblingRows: SiblingRow[]
): SiblingOrderSummary[] {
  const summaries = siblingRows
    .map((row) => {
      const summary = toSiblingSummary(row, currentOrder.orderId);
      if (!summary) throw new Error('Order group contains a member without a book identity');

      const createdAt = row.created_at ? String(row.created_at) : undefined;
      return {
        summary,
        createdAt,
      };
    })
    .filter((entry): entry is { summary: SiblingOrderSummary; createdAt?: string } => !!entry);

  if (!summaries.some((entry) => entry.summary.orderId === currentOrder.orderId)) {
    throw new Error('Current order is missing from the verified group');
  }
  if (new Set(summaries.map(entry => entry.summary.orderId)).size !== summaries.length) {
    throw new Error('Duplicate order group identity');
  }

  summaries.sort((a, b) => {
    if (
      typeof a.summary.itemNumber === 'number' &&
      typeof b.summary.itemNumber === 'number'
    ) {
      return a.summary.itemNumber - b.summary.itemNumber;
    }

    if (a.createdAt && b.createdAt) {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (!Number.isNaN(timeDiff) && timeDiff !== 0) {
        return timeDiff;
      }
    }

    return a.summary.orderId.localeCompare(b.summary.orderId);
  });

  return summaries.map((entry) => entry.summary);
}

export function attachSiblingOrderSummaries(
  order: Order,
  siblingRows: SiblingRow[]
): Order {
  if (!order.rootOrderId) {
    return order;
  }

  const siblingOrders = buildSiblingOrderSummaries(order, siblingRows);
  if (siblingOrders.length === 0) {
    return order;
  }

  return {
    ...order,
    siblingOrders,
    isSibling: siblingOrders.length > 1,
    totalSiblings: siblingOrders.length,
  };
}

export function attachListSiblingMetadata(orders: Order[]): Order[] {
  const groupIds = new Map<string, Set<string>>();
  for (const order of orders) {
    if (!order.rootOrderId) continue;
    const ids = groupIds.get(order.rootOrderId) ?? new Set<string>();
    ids.add(order.orderId);
    groupIds.set(order.rootOrderId, ids);
  }
  return orders.map(order => {
    const count = order.rootOrderId ? groupIds.get(order.rootOrderId)?.size ?? 0 : 0;
    return count > 1 ? { ...order, isSibling: true, totalSiblings: count } : order;
  });
}
