'use client';

import { useState } from 'react';
import { OrderListItem } from '@/types/order';
import { StatusBadge } from '@/components/ui/status-badge';
import { DualStatusBadge } from '@/components/ui/dual-status-badge';
import { FlaggedBadge } from '@/components/ui/flagged-badge';
import { formatDate, formatPlatformName } from '@/lib/utils';
import { getOrderFlagSummary, getActiveStageFlagCount } from '@/lib/review-state';
import { DisplayStatus } from '@/constants/statuses';
import { Search, ChevronDown, Archive } from 'lucide-react';

interface OrdersTableProps {
  orders: OrderListItem[];
  onOrderClick: (orderId: string) => void;
  onArchiveOrder?: (orderId: string) => void;
}

export function OrdersTable({ orders, onOrderClick, onArchiveOrder }: OrdersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DisplayStatus>('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.characterHash && order.characterHash.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || order.workflowStatus === statusFilter;
    const matchesPlatform = platformFilter === 'all' || order.platform === platformFilter;
    
    return matchesSearch && matchesStatus && matchesPlatform;
  });

  const statusOptions: { value: DisplayStatus; label: string }[] = [
    { value: DisplayStatus.IN_QUEUE, label: 'In Queue' },
    { value: DisplayStatus.REVIEW_POSES, label: 'Review Poses' },
    { value: DisplayStatus.REVIEW_BACKGROUNDS, label: 'Review Backgrounds' },
    { value: DisplayStatus.REVIEW_PAGES, label: 'Review Pages' },
    { value: DisplayStatus.PROOF_READY, label: 'Proof Ready' },
    { value: DisplayStatus.AWAITING_CUSTOMER, label: 'Awaiting Customer' },
    { value: DisplayStatus.NEEDS_REVISION, label: 'Needs Revision' },
    { value: DisplayStatus.READY_TO_PRINT, label: 'Ready to Print' },
    { value: DisplayStatus.PRINTING, label: 'Printing' },
    { value: DisplayStatus.SHIPPED, label: 'Shipped' },
    { value: DisplayStatus.DELIVERED, label: 'Delivered' },
    { value: DisplayStatus.ACTION_REQUIRED, label: 'Action Required' },
  ];

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
            onChange={(e) => setStatusFilter(e.target.value as 'all' | DisplayStatus)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
            aria-label="Filter by platform"
          >
            <option value="all">All Platforms</option>
            <option value="amazon">Amazon</option>
            <option value="d2c">D2C</option>
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
                // Get flag count for the active stage (the stage the order is currently in)
                const activeStageFlagCount = getActiveStageFlagCount(order);
                const needsAttention = activeStageFlagCount > 0;
                return (
                  <tr
                    key={order.orderId}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onOrderClick(order.orderId)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="truncate">{order.orderId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.firstName} {order.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatPlatformName(order.platform)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <DualStatusBadge
                          workflowStatus={order.workflowStatus}
                          technicalStatus={order.technicalStatus}
                          revisionCount={order.revisionCount}
                          errors={order.errors}
                        />
                        {needsAttention && (
                          <FlaggedBadge count={activeStageFlagCount} />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(order.orderDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-3">
                        <button className="text-blue-600 hover:text-blue-900 font-medium">
                          Open
                        </button>
                        {onArchiveOrder && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Archive order ${order.orderId}?`)) {
                                onArchiveOrder(order.orderId);
                              }
                            }}
                            className="text-gray-500 hover:text-gray-700 flex items-center space-x-1"
                            title="Archive order"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
