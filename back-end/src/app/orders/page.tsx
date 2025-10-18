'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OrdersTable } from '@/components/orders/orders-table';
import { OrderListItem } from '@/types/order';
import { getOrderListItems } from '@/lib/mock-data';
import { getOrderFlagSummary } from '@/lib/review-state';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch orders from API
    fetch('/api/orders')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch orders');
        }
        return response.json();
      })
      .then(data => {
        // Convert Order[] to OrderListItem[]
        const orderListItems: OrderListItem[] = data.map((order: any) => ({
          orderId: order.orderId,
          platform: order.platform,
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          status: order.status,
          orderDate: order.orderDate,
          characterHash: order.characterHash
        }));
        setOrders(orderListItems);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching orders:', error);
        // Fallback to mock data
        setOrders(getOrderListItems());
        setLoading(false);
      });
  }, []);

  const handleOrderClick = (orderId: string) => {
    router.push(`/orders/${orderId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="mt-2 text-gray-600">
            Manage and review personalized book orders
          </p>
        </div>

        <OrdersTable orders={orders} onOrderClick={handleOrderClick} />
      </div>
    </div>
  );
}
