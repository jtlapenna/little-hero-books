'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { OrdersTable } from '@/components/orders/orders-table';
import { PhaseSummary } from '@/components/orders/phase-summary';
import { PhaseBucket } from '@/components/orders/phase-bucket';
import { Order, OrderListItem } from '@/types/order';
import { OrderPhase, groupOrdersByPhase, ACTIVE_PHASE_ORDER } from '@/constants/phases';
import { DisplayStatus } from '@/constants/statuses';
import { DualStatusBadge } from '@/components/ui/dual-status-badge';
import { SiblingCountBadge } from '@/components/ui/sibling-count-badge';
import { formatDate } from '@/lib/utils';
import { buildOrderListItem } from '@/lib/status-display';
import { RefreshCw, Archive, ChevronDown, ChevronUp } from 'lucide-react';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<OrderPhase | null>(null);
  const [viewMode, setViewMode] = useState<'buckets' | 'table'>('table');
  const [showRecentlyDelivered, setShowRecentlyDelivered] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState<OrderListItem[]>([]);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const mapOrderListItems = useCallback((data: Order[]): OrderListItem[] => {
    const orderListItems: OrderListItem[] = data
      .map((order) => {
        try {
          return buildOrderListItem(order);
        } catch (error: unknown) {
          console.error(`[Orders Page] Failed to build order list item for ${order.orderId}:`, error);
          return {
            orderId: order.orderId || 'unknown',
            platform: order.platform || 'amazon',
            rootOrderId: order.rootOrderId,
            isSibling: order.isSibling,
            itemNumber: order.itemNumber,
            totalSiblings: order.totalSiblings,
            firstName: order.customer?.firstName || 'Unknown',
            lastName: order.customer?.lastName || '',
            workflowStatus: DisplayStatus.ACTION_REQUIRED,
            technicalStatus: DisplayStatus.ACTION_REQUIRED,
            status: DisplayStatus.ACTION_REQUIRED,
            rawStatus: order.status || 'unknown',
            phase: OrderPhase.IN_QUEUE,
            orderDate: order.orderDate || new Date().toISOString(),
            characterHash: order.characterHash,
            reviewStages: order.reviewStages,
            customerApprovalStatus: order.customerApprovalStatus ?? null,
            hasFlags: order.hasFlags ?? false,
            flags: order.flags || {},
            revisionCount: typeof order.revisionCount === 'number' ? order.revisionCount : 0,
            errors: [DisplayStatus.ACTION_REQUIRED],
            lifecycle_status: order.lifecycle_status || 'active',
          };
        }
      })
      .filter((item): item is OrderListItem => item !== null && item !== undefined);

    const lifecycleCounts = orderListItems.reduce((acc, order) => {
      const status = order.lifecycle_status || 'undefined';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`[Orders Page] Loaded ${orderListItems.length} orders. Lifecycle distribution:`, lifecycleCounts);

    return orderListItems;
  }, []);

  const fetchActiveOrders = useCallback(async (isRefresh = false) => {
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
      setOrders(mapOrderListItems(data));
    } catch (error) {
      console.error('Error fetching orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mapOrderListItems]);

  const fetchArchivedOrders = useCallback(async () => {
    setArchivedLoading(true);

    try {
      const response = await fetch('/api/orders?include_archived=true');
      if (!response.ok) {
        throw new Error('Failed to fetch archived orders');
      }

      const data: Order[] = await response.json();
      const archivedOnly = mapOrderListItems(data).filter(
        (order) => order.lifecycle_status === 'archived'
      );

      setArchivedOrders(archivedOnly);
      setArchivedLoaded(true);
    } catch (error) {
      console.error('Error fetching archived orders:', error);
      setArchivedOrders([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [mapOrderListItems]);

  useEffect(() => {
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  const handleRefresh = () => {
    fetchActiveOrders(true);
    if (archivedLoaded) {
      fetchArchivedOrders();
    }
  };

  const handleOrderClick = (orderId: string) => {
    router.push(`/orders/${orderId}`);
  };

  const handlePhaseClick = (phase: OrderPhase) => {
    setSelectedPhase(selectedPhase === phase ? null : phase);
  };

  // Archive selected orders
  const handleArchiveSelected = async () => {
    if (selectedOrders.size === 0) return;
    
    setArchiving(true);
    try {
      const response = await fetch('/api/admin/orders/archive-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrders),
          reason: 'manual_bulk',
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to archive orders');
      }
      
      const result = await response.json();
      console.log(`[Orders Page] Archived ${result.archived} orders`);
      
      // Clear selection and refresh
      setSelectedOrders(new Set());
      handleRefresh();
    } catch (error) {
      console.error('Error archiving orders:', error);
      alert('Failed to archive orders. Please try again.');
    } finally {
      setArchiving(false);
    }
  };

  // Archive a single order
  const handleArchiveOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to archive order');
      }
      
      console.log(`[Orders Page] Archived order ${orderId}`);
      handleRefresh();
    } catch (error) {
      console.error('Error archiving order:', error);
      alert('Failed to archive order. Please try again.');
    }
  };

  const ordersByPhase = groupOrdersByPhase(orders);
  
  // Separate active orders from recently delivered and archived
  const activeOrders = orders.filter(
    (o) => o.lifecycle_status !== 'recently_delivered' && o.lifecycle_status !== 'archived'
  );
  const recentlyDeliveredOrders = ordersByPhase[OrderPhase.RECENTLY_DELIVERED] || [];
  const archivedPhaseOrders = archivedLoaded ? archivedOrders : [];
  
  const filteredOrders = selectedPhase ? ordersByPhase[selectedPhase] : activeOrders;

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

          {/* Phase Summary - only show active orders */}
          <PhaseSummary
            orders={activeOrders}
            onPhaseClick={handlePhaseClick}
            showEmptyPhases={true}
            className="mb-6"
          />

          {/* Bulk archive button (only shows when orders are selected) */}
          {selectedOrders.size > 0 && (
            <div className="mb-4">
              <button
                onClick={handleArchiveSelected}
                disabled={archiving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 flex items-center space-x-2"
              >
                <Archive className="h-4 w-4" />
                <span>
                  {archiving ? 'Archiving...' : `Archive ${selectedOrders.size} selected`}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {viewMode === 'buckets' ? (
          <div className="space-y-4">
            {/* Active phases only (excludes recently_delivered and archived) */}
            {ACTIVE_PHASE_ORDER.filter(phase => phase !== OrderPhase.RECENTLY_DELIVERED).map((phase) => {
              const phaseOrders = ordersByPhase[phase];
              if (phaseOrders.length === 0) return null;

              return (
                <PhaseBucket
                  key={phase}
                  phase={phase}
                  orders={phaseOrders}
                  defaultExpanded={selectedPhase === phase || selectedPhase === null}
                  renderOrder={(order) => (
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
                              <SiblingCountBadge
                                isSibling={order.isSibling}
                                totalSiblings={order.totalSiblings}
                              />
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
          <OrdersTable orders={filteredOrders} onOrderClick={handleOrderClick} onArchiveOrder={handleArchiveOrder} />
        )}

        {/* Recently Delivered Section (collapsible) */}
        {recentlyDeliveredOrders.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowRecentlyDelivered(!showRecentlyDelivered)}
              className="w-full flex items-center justify-between px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">📦</span>
                <span className="font-medium text-teal-700">Recently Delivered</span>
                <span className="text-sm text-teal-600">({recentlyDeliveredOrders.length})</span>
              </div>
              {showRecentlyDelivered ? (
                <ChevronUp className="h-5 w-5 text-teal-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-teal-600" />
              )}
            </button>
            {showRecentlyDelivered && (
              <div className="mt-2 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {recentlyDeliveredOrders.map((order) => (
                  <div
                    key={order.orderId}
                    onClick={() => handleOrderClick(order.orderId)}
                    className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {order.firstName} {order.lastName}
                        </span>
                        <span className="text-xs text-gray-500">({order.orderId})</span>
                        <SiblingCountBadge
                          isSibling={order.isSibling}
                          totalSiblings={order.totalSiblings}
                        />
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatDate(order.orderDate)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchiveOrder(order.orderId);
                      }}
                      className="ml-4 px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center space-x-1"
                    >
                      <Archive className="h-3 w-3" />
                      <span>Archive</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Archived Orders Section (collapsible) */}
        <div className="mt-4">
            <button
              onClick={() => {
                const next = !showArchived;
                setShowArchived(next);
                if (next && !archivedLoaded && !archivedLoading) {
                  void fetchArchivedOrders();
                }
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">🗄️</span>
                <span className="font-medium text-slate-600">Archived</span>
                {archivedLoaded && (
                  <span className="text-sm text-slate-500">({archivedPhaseOrders.length})</span>
                )}
              </div>
              {showArchived ? (
                <ChevronUp className="h-5 w-5 text-slate-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-500" />
              )}
            </button>
            {showArchived && archivedLoading && (
              <div className="mt-2 bg-white rounded-lg border border-gray-200 px-6 py-4 text-sm text-gray-500">
                Loading archived orders...
              </div>
            )}
            {showArchived && archivedLoaded && archivedPhaseOrders.length === 0 && (
              <div className="mt-2 bg-white rounded-lg border border-gray-200 px-6 py-4 text-sm text-gray-500">
                No archived orders found.
              </div>
            )}
            {showArchived && archivedLoaded && archivedPhaseOrders.length > 0 && (
              <div className="mt-2 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {archivedPhaseOrders.map((order) => (
                  <div
                    key={order.orderId}
                    onClick={() => handleOrderClick(order.orderId)}
                    className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-500">
                        {order.firstName} {order.lastName}
                      </span>
                      <span className="text-xs text-gray-400">({order.orderId})</span>
                      <SiblingCountBadge
                        isSibling={order.isSibling}
                        totalSiblings={order.totalSiblings}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {formatDate(order.orderDate)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
