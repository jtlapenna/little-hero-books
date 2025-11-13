'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface StuckOrder {
  id: number;
  amazon_order_id: string;
  execution_status: string;
  current_workflow: string | null;
  started_at: string | null;
  workflow_step: string | null;
  manifest_2a_url: string | null;
  manifest_2b_url: string | null;
  manifest_3_url: string | null;
  minutesProcessing: number | null;
  hasManifest: boolean;
  stuckStatus: 'no_timestamp' | 'stuck_over_hour' | 'stuck_over_30min' | 'recent';
}

export default function StuckOrdersPage() {
  const [orders, setOrders] = useState<StuckOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchStuckOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/stuck-orders?timeoutMinutes=30');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch stuck orders');
      }
      
      setOrders(data.orders || []);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load stuck orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStuckOrders();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStuckOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleResetOrders = async (newStatus: 'done' | 'ready_for_processing' = 'ready_for_processing') => {
    if (selectedOrders.size === 0) return;

    setResetting(true);
    try {
      const response = await fetch('/api/admin/stuck-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrders),
          newStatus
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset orders');
      }

      // Remove reset orders from list
      setOrders(prev => prev.filter(o => !selectedOrders.has(o.amazon_order_id)));
      setSelectedOrders(new Set());
      await fetchStuckOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to reset orders');
    } finally {
      setResetting(false);
    }
  };

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedOrders(new Set(orders.map(o => o.amazon_order_id)));
  };

  const getStatusBadge = (order: StuckOrder) => {
    switch (order.stuckStatus) {
      case 'no_timestamp':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">No Timestamp</span>;
      case 'stuck_over_hour':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">Stuck {'>'} 1h</span>;
      case 'stuck_over_30min':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">Stuck {'>'} 30m</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">Recent</span>;
    }
  };

  const capacityBlocked = orders.length >= 5;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stuck Processing Orders</h1>
              <p className="mt-2 text-gray-600">
                Orders stuck in 'processing' state that are blocking W1.1 router capacity
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchStuckOrders}
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

        {capacityBlocked && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-red-800">
                  Capacity Blocked
                </h3>
                <p className="mt-1 text-sm text-red-700">
                  {orders.length} orders are stuck, blocking all new orders from being processed. Reset stuck orders to free capacity.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {selectedOrders.size > 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-blue-400 mr-3" />
                <span className="text-sm font-medium text-blue-800">
                  {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleResetOrders('ready_for_processing')}
                  disabled={resetting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {resetting ? 'Resetting...' : 'Reset to Ready'}
                </button>
                <button
                  onClick={() => handleResetOrders('done')}
                  disabled={resetting}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50"
                >
                  Mark as Done
                </button>
                <button
                  onClick={() => setSelectedOrders(new Set())}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading stuck orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Stuck Orders</h3>
            <p className="text-gray-500">All orders are processing normally.</p>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedOrders.size === orders.length && orders.length > 0}
                  onChange={selectAll}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-3"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({orders.length} orders)
                </span>
              </div>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workflow</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Has Manifest</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.amazon_order_id)}
                        onChange={() => toggleSelectOrder(order.amazon_order_id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{order.amazon_order_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{order.current_workflow || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {order.started_at
                          ? new Date(order.started_at).toLocaleString()
                          : 'No timestamp'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {order.minutesProcessing !== null
                          ? `${order.minutesProcessing}m`
                          : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(order)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {order.hasManifest ? (
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-400" />
                      )}
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

