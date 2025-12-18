'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OrdersTable } from '@/components/orders/orders-table';
import { PhaseSummary } from '@/components/orders/phase-summary';
import { PhaseBucket } from '@/components/orders/phase-bucket';
import { Order, OrderListItem } from '@/types/order';
import { getOrderListItems } from '@/lib/mock-data';
import { getOrderFlagSummary } from '@/lib/review-state';
import { OrderPhase, groupOrdersByPhase, PHASE_ORDER } from '@/constants/phases';
import { StatusBadge } from '@/components/ui/status-badge';
import { DualStatusBadge } from '@/components/ui/dual-status-badge';
import { formatDate } from '@/lib/utils';
import { buildOrderListItem } from '@/lib/status-display';
import { RefreshCw } from 'lucide-react';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<OrderPhase | null>(null);
  const [viewMode, setViewMode] = useState<'buckets' | 'table'>('table');

  const fetchOrders = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/orders');
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data: Order[] = await response.json();
      const orderListItems: OrderListItem[] = data
        .map((order) => {
          try {
            return buildOrderListItem(order);
          } catch (error: any) {
            console.error(`[Orders Page] Failed to build order list item for ${order.orderId}:`, error);
            // Return a minimal order list item so it still appears
            return {
              orderId: order.orderId || 'unknown',
              platform: order.platform || 'amazon',
              firstName: order.customer?.firstName || 'Unknown',
              lastName: order.customer?.lastName || '',
              workflowStatus: 'action_required' as any,
              technicalStatus: 'action_required' as any,
              status: 'action_required' as any,
              rawStatus: order.status || 'unknown',
              phase: 'in_queue' as any,
              orderDate: order.orderDate || new Date().toISOString(),
              characterHash: order.characterHash,
              reviewStages: order.reviewStages,
              customerApprovalStatus: order.customerApprovalStatus ?? null,
              hasFlags: order.hasFlags ?? false,
              flags: order.flags || {},
              revisionCount: typeof order.revisionCount === 'number' ? order.revisionCount : 0,
              errors: ['action_required' as any],
            };
          }
        })
        .filter((item): item is OrderListItem => item !== null && item !== undefined);
      console.log(`[Orders Page] Loaded ${orderListItems.length} orders from ${data.length} API orders`);
      setOrders(orderListItems);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Don't fallback to mock data - show empty state instead
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleRefresh = () => {
    fetchOrders(true);
  };

  const handleOrderClick = (orderId: string) => {
    router.push(`/orders/${orderId}`);
  };

  const handlePhaseClick = (phase: OrderPhase) => {
    setSelectedPhase(selectedPhase === phase ? null : phase);
  };

  const ordersByPhase = groupOrdersByPhase(orders);
  const filteredOrders = selectedPhase ? ordersByPhase[selectedPhase] : orders;

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
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="mt-2 text-gray-600">
            Manage and review personalized book orders
          </p>
        </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                title="Refresh orders"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setViewMode('buckets')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'buckets'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Phase View
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Table View
              </button>
            </div>
          </div>

          {/* Phase Summary */}
          <PhaseSummary
            orders={orders}
            onPhaseClick={handlePhaseClick}
            showEmptyPhases={true}
            className="mb-6"
          />
        </div>

        {/* Content */}
        {viewMode === 'buckets' ? (
          <div className="space-y-4">
            {PHASE_ORDER.map((phase) => {
              const phaseOrders = ordersByPhase[phase];
              if (phaseOrders.length === 0) return null;

              return (
                <PhaseBucket
                  key={phase}
                  phase={phase}
                  orders={phaseOrders}
                  defaultExpanded={selectedPhase === phase || selectedPhase === null}
                  renderOrder={(order, index) => (
                    <div
                      key={order.orderId}
                      onClick={() => handleOrderClick(order.orderId)}
                      className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {order.firstName} {order.lastName}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({order.orderId})
                              </span>
                            </div>
                            <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                              <span>{order.platform}</span>
                              <span>•</span>
                              <span>{formatDate(order.orderDate)}</span>
                              {order.characterHash && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono">{order.characterHash.slice(0, 8)}...</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="ml-4">
                          <DualStatusBadge
                            workflowStatus={order.workflowStatus}
                            technicalStatus={order.technicalStatus}
                            revisionCount={order.revisionCount}
                            errors={order.errors}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                />
              );
            })}
          </div>
        ) : (
          <OrdersTable orders={filteredOrders} onOrderClick={handleOrderClick} />
        )}
      </div>
    </div>
  );
}
