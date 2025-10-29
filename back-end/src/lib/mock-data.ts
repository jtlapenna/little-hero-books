// ⚠️ PLACEHOLDER FILE - Developer A must replace this with real Supabase integration
// This is a temporary placeholder to allow the build to succeed

import { Order, OrderListItem } from "@/types/order";

// Mock order data - Developer A must replace with real Supabase queries
const mockOrders: Order[] = [];

export function getOrderById(id: string): Order | null {
  return mockOrders.find((o) => o.id === id) || null;
}

export function getOrderListItems(): OrderListItem[] {
  return mockOrders.map((order) => ({
    id: order.id,
    amazonOrderId: order.amazonOrderId,
    childName: order.characterSpecs.childName,
    status: order.status,
    createdAt: order.createdAt,
  }));
}

export function getOrderByAmazonOrderId(amazonOrderId: string): Order | null {
  return mockOrders.find((o) => o.amazonOrderId === amazonOrderId) || null;
}

