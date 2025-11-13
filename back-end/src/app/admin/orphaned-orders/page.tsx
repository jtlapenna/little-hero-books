'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface OrphanedOrder {
  id: number;
  amazon_order_id: string;
  execution_status: string;
  retry_count: number | null;
  next_retry_at: string | null;
  error_type: string | null;
  error_message: string | null;
  orphan_reason: string;
  minutes_orphaned: number;
  updated_at: string;
}

export default function OrphanedOrdersPage() {
  const [orders, setOrders] = useState<OrphanedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [recovering, setRecovering] = useState(false);

  const fetchOrphanedOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/orphaned-orders?minMinutes=30');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setOrders(data.orders || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch orphaned orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrphanedOrders();
    const interval = setInterval(fetchOrphanedOrders, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const getReasonBadge = (reason: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      'error_no_retry_scheduled': { label: 'Error: No Retry', color: 'bg-red-100 text-red-800' },
      'error_max_retries_exceeded': { label: 'Max Retries', color: 'bg-orange-100 text-orange-800' },
      'processing_stuck_over_hour': { label: 'Stuck > 1h', color: 'bg-red-100 text-red-800' },
      'processing_no_timestamp': { label: 'No Timestamp', color: 'bg-yellow-100 text-yellow-800' },
      'ready_not_picked_up': { label: 'Not Picked Up', color: 'bg-blue-100 text-blue-800' }
    };
    const badge = badges[reason] || { label: reason, color: 'bg-gray-100 text-gray-800' };
    return <span className={`px-2 py-1 text-xs font-medium rounded ${badge.color}`}>{badge.label}</span>;
  };

  const getRecoveryAction = (reason: string) => {
    if (reason === 'error_no_retry_scheduled') return 'schedule_retry';
    if (reason === 'error_max_retries_exceeded') return 'manual_review';
    if (reason.startsWith('processing_')) return 'reset_processing';
    return 'manual_review';
  };

  const recoverOrders = async (action: string) => {
    if (selectedOrders.size === 0) return;
    
    setRecovering(true);
    try {
      const response = await fetch('/api/admin/orphaned-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrders),
          action
        })
      });

      if (!response.ok) throw new Error('Recovery failed');
      
      await fetchOrphanedOrders();
      setSelectedOrders(new Set());
    } catch (error) {
      console.error('Failed to recover orders:', error);
      alert('Failed to recover orders. Check console for details.');
    } finally {
      setRecovering(false);
    }
  };

  const toggleOrder = (id: number) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedOrders(newSelected);
  };

  const selectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(o => o.id)));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Orphaned Orders Monitor</h1>
              <p className="mt-2 text-gray-600">
                Orders stuck without any workflow processing them
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchOrphanedOrders}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <div className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        {orders.length > 0 && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-yellow-400 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">
                  {orders.length} orphaned order{orders.length !== 1 ? 's' : ''} found
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  These orders are not being processed by any workflow. Select orders and choose a recovery action.
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedOrders.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">
                {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => recoverOrders('schedule_retry')}
                  disabled={recovering}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Schedule Retry
                </button>
                <button
                  onClick={() => recoverOrders('manual_review')}
                  disabled={recovering}
                  className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                >
                  Mark for Manual Review
                </button>
                <button
                  onClick={() => recoverOrders('reset_processing')}
                  disabled={recovering}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Reset Processing
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
            <p className="mt-2 text-gray-500">Loading orphaned orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Orphaned Orders</h3>
            <p className="mt-2 text-sm text-gray-500">
              All orders are being processed by their respective workflows.
            </p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedOrders.size === orders.length && orders.length > 0}
                      onChange={selectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Retry Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orphaned For
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error Message
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.id)}
                        onChange={() => toggleOrder(order.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <a 
                        href={`/orders/${order.amazon_order_id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {order.amazon_order_id}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.execution_status}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getReasonBadge(order.orphan_reason)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.retry_count ?? 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {Math.floor(order.minutes_orphaned)} min
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.error_type || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate" title={order.error_message || ''}>
                      {order.error_message || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

