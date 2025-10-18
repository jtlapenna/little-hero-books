'use client';

import { useState } from 'react';
import { OrderListItem } from '@/types/order';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { getOrderFlagSummary } from '@/lib/review-state';
import { Search, Filter, ChevronDown } from 'lucide-react';

interface OrdersTableProps {
  orders: OrderListItem[];
  onOrderClick: (orderId: string) => void;
}

export function OrdersTable({ orders, onOrderClick }: OrdersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.characterHash && order.characterHash.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesPlatform = platformFilter === 'all' || order.platform === platformFilter;
    
    return matchesSearch && matchesStatus && matchesPlatform;
  });

  const getStatusFromOrder = (order: OrderListItem) => {
    // This would normally come from the order's review stages
    // For now, we'll use the order status
    if (order.status === 'completed') return 'approved';
    if (order.status === 'in_review') return 'in-review';
    return 'pending';
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search by order ID, character hash, name, or platform..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-600 text-gray-900"
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in-review">In Review</option>
            <option value="approved">Approved</option>
          </select>
          
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
          >
            <option value="all">All Platforms</option>
            <option value="amazon">Amazon</option>
            <option value="etsy">Etsy</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => {
                const flagSummary = getOrderFlagSummary(order.orderId);
                const needsAttention = flagSummary.total > 0;
                return (
                  <tr
                    key={order.orderId}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onOrderClick(order.orderId)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="truncate">{order.orderId}</span>
                        {needsAttention && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap flex-shrink-0">
                            {flagSummary.total} {flagSummary.total === 1 ? 'Needs' : 'Need'} Attention
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.firstName} {order.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {order.platform}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={getStatusFromOrder(order)} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(order.orderDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button className="text-blue-600 hover:text-blue-900 font-medium">
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No orders found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
