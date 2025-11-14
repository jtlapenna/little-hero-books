'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, Filter } from 'lucide-react';

interface OrderNeedingAttention {
  id: number;
  amazon_order_id: string;
  execution_status: string;
  retry_count: number | null;
  next_retry_at: string | null;
  next_workflow: string | null;
  error_type: string | null;
  error_message: string | null;
  errorReason: string;
  timeStuck: number | null;
  source: 'orphaned' | 'stuck' | 'error_status';
  updated_at: string;
  started_at?: string | null;
  current_workflow?: string | null;
  workflow_step?: string | null;
}

export default function OrdersNeedingAttentionPage() {
  const [orders, setOrders] = useState<OrderNeedingAttention[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [recovering, setRecovering] = useState(false);
  const [filterErrorType, setFilterErrorType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterErrorType) params.append('errorType', filterErrorType);
      if (filterStatus) params.append('status', filterStatus);
      
      const response = await fetch(`/api/admin/orders-needing-attention?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setOrders(data.orders || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch orders needing attention:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [filterErrorType, filterStatus]);

  const getReasonBadge = (reason: string, errorType: string | null) => {
    const badges: Record<string, { label: string; color: string }> = {
      'error_no_retry_scheduled': { label: 'Error: No Retry', color: 'bg-red-100 text-red-800' },
      'error_max_retries_exceeded': { label: 'Max Retries', color: 'bg-orange-100 text-orange-800' },
      'processing_stuck_over_hour': { label: 'Stuck > 1h', color: 'bg-red-100 text-red-800' },
      'processing_stuck_over_30min': { label: 'Stuck > 30m', color: 'bg-orange-100 text-orange-800' },
      'processing_no_timestamp': { label: 'No Timestamp', color: 'bg-yellow-100 text-yellow-800' },
      'ready_not_picked_up': { label: 'Not Picked Up', color: 'bg-blue-100 text-blue-800' },
      'missing_manifest': { label: 'Missing Manifest', color: 'bg-purple-100 text-purple-800' },
      'workflow_timeout': { label: 'Workflow Timeout', color: 'bg-red-100 text-red-800' },
      'api_error': { label: 'API Error', color: 'bg-red-100 text-red-800' },
      'error': { label: 'Error', color: 'bg-red-100 text-red-800' },
      'orphaned_order': { label: 'Orphaned', color: 'bg-yellow-100 text-yellow-800' },
      'manual_review_required': { label: 'Manual Review', color: 'bg-orange-100 text-orange-800' }
    };
    
    const key = errorType || reason;
    const badge = badges[key] || { label: reason || errorType || 'Unknown', color: 'bg-gray-100 text-gray-800' };
    return <span className={`px-2 py-1 text-xs font-medium rounded ${badge.color}`}>{badge.label}</span>;
  };

  const getRecoveryAction = (reason: string, executionStatus: string) => {
    if (executionStatus === 'error_requires_manual_review') return 'manual_review';
    if (reason === 'error_no_retry_scheduled' || reason === 'ready_not_picked_up') return 'schedule_retry';
    if (reason === 'error_max_retries_exceeded') return 'manual_review';
    if (reason.startsWith('processing_')) return 'reset_processing';
    if (executionStatus === 'error') return 'reset_processing';
    return 'manual_review';
  };

  const recoverOrders = async (action: string) => {
    if (selectedOrders.size === 0) return;
    
    setRecovering(true);
    try {
      const response = await fetch('/api/admin/orders-needing-attention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrders),
          action
        })
      });

      if (!response.ok) throw new Error('Recovery failed');
      
      await fetchOrders();
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

  // Get all possible error types (from DisplayStatus enum and common error reasons)
  const allPossibleErrorTypes = [
    'missing_manifest',
    'max_retries',
    'workflow_timeout',
    'api_error',
    'stuck_processing',
    'not_picked_up',
    'error_no_retry_scheduled',
    'error_max_retries_exceeded',
    'processing_stuck_over_hour',
    'processing_stuck_over_30min',
    'processing_no_timestamp',
    'ready_not_picked_up',
    'orphaned_order',
    'manual_review_required',
    'error',
    'multiple_errors'
  ];
  
  // Get unique error types from current orders (for sorting - show existing first)
  const currentErrorTypes = Array.from(new Set(orders.map(o => o.error_type || o.errorReason).filter(Boolean))) as string[];
  
  // Combine: existing error types first, then all possible types
  const errorTypes = Array.from(new Set([...currentErrorTypes, ...allPossibleErrorTypes]));
  
  // Get unique statuses for filters
  const statuses = Array.from(new Set(orders.map(o => o.execution_status))) as string[];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Orders Needing Attention</h1>
              <p className="mt-2 text-gray-600">
                All orders with errors, stuck processing, or requiring manual intervention
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchOrders}
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

        {/* Filters */}
        <div className="mb-4 bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-400" />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Error Type
                </label>
                <select
                  value={filterErrorType}
                  onChange={(e) => setFilterErrorType(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="" className="text-gray-900">All Error Types</option>
                  {errorTypes.map(type => (
                    <option key={type} value={type} className="text-gray-900">{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="" className="text-gray-900">All Statuses</option>
                  {statuses.map(status => (
                    <option key={status} value={status} className="text-gray-900">{status}</option>
                  ))}
                </select>
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
                  {orders.length} order{orders.length !== 1 ? 's' : ''} needing attention
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  These orders have errors, are stuck processing, or require manual intervention. Select orders and choose a recovery action.
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
            <p className="mt-2 text-gray-500">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Orders Needing Attention</h3>
            <p className="mt-2 text-sm text-gray-500">
              All orders are processing normally.
            </p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="overflow-x-auto max-w-full">
              <table className="min-w-full divide-y divide-gray-200" style={{ minWidth: '1200px' }}>
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
                      Next Retry At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Next Workflow
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time Stuck
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error Message
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
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
                        >
                          {order.amazon_order_id}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.execution_status}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getReasonBadge(order.errorReason, order.error_type)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.retry_count ?? 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.next_retry_at 
                          ? new Date(order.next_retry_at).toLocaleString()
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.next_workflow || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.timeStuck !== null ? `${Math.floor(order.timeStuck)} min` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.error_type || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate" title={order.error_message || ''}>
                        {order.error_message || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 py-1 text-xs rounded ${
                          order.source === 'orphaned' ? 'bg-yellow-100 text-yellow-800' :
                          order.source === 'stuck' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {order.source}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

