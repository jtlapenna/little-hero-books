'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OrderListItem } from '@/types/order';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { getOrderListItems } from '@/lib/mock-data';
import { getOrderFlagSummary } from '@/lib/review-state';
import { ArrowRight, Clock, AlertCircle, Search, Grid3X3, List, ChevronDown } from 'lucide-react';

export default function ReviewPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'orderDate' | 'firstName' | 'lastName' | 'platform'>('orderDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

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
        // Convert Order[] to OrderListItem[] and filter for pending reviews
        const orderListItems: OrderListItem[] = data
          .filter((order: any) => order.status !== 'completed')
          .map((order: any) => ({
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
        const allOrders = getOrderListItems();
        const pendingOrders = allOrders.filter(order => order.status !== 'completed');
        setOrders(pendingOrders);
        setLoading(false);
      });
  }, []);

  // Filter and sort orders
  const filteredAndSortedOrders = orders
    .filter(order => {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.orderId.toLowerCase().includes(searchLower) ||
        order.firstName.toLowerCase().includes(searchLower) ||
        order.lastName.toLowerCase().includes(searchLower) ||
        order.platform.toLowerCase().includes(searchLower) ||
        (order.characterHash && order.characterHash.toLowerCase().includes(searchLower))
      );
    })
    .sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'orderDate':
          aValue = new Date(a.orderDate).getTime();
          bValue = new Date(b.orderDate).getTime();
          break;
        case 'firstName':
          aValue = a.firstName.toLowerCase();
          bValue = b.firstName.toLowerCase();
          break;
        case 'lastName':
          aValue = a.lastName.toLowerCase();
          bValue = b.lastName.toLowerCase();
          break;
        case 'platform':
          aValue = a.platform.toLowerCase();
          bValue = b.platform.toLowerCase();
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  const handleOrderClick = (orderId: string) => {
    router.push(`/orders/${orderId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading pending reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Pending Reviews</h1>
              <p className="mt-2 text-gray-600">
                Orders that require human review and approval
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                {filteredAndSortedOrders.length} orders
              </span>
            </div>
          </div>
        </div>

        {/* Search and Controls */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
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

            {/* Sort Controls */}
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
              >
                <option value="orderDate">Order Date</option>
                <option value="firstName">First Name</option>
                <option value="lastName">Last Name</option>
                <option value="platform">Platform</option>
              </select>
              
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* View Toggle */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 flex items-center ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 flex items-center border-l border-gray-300 ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filteredAndSortedOrders.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <AlertCircle className="h-12 w-12" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {searchTerm ? 'No orders found' : 'No pending reviews'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm 
                ? 'Try adjusting your search criteria.'
                : 'All orders have been reviewed and approved.'
              }
            </p>
            <div className="mt-6">
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm('')}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 mr-2"
                >
                  Clear Search
                </button>
              ) : null}
              <button
                onClick={() => router.push('/orders')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                View All Orders
              </button>
            </div>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedOrders.map((order) => {
              const flagSummary = getOrderFlagSummary(order.orderId);
              const needsAttention = flagSummary.total > 0;
              return (
                <div
                  key={order.orderId}
                  onClick={() => handleOrderClick(order.orderId)}
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4 gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 truncate flex-1 min-w-0">
                      {order.orderId}
                    </h3>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {needsAttention && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap">
                          {flagSummary.total} {flagSummary.total === 1 ? 'Needs' : 'Need'} Attention
                        </span>
                      )}
                      <StatusBadge status={order.status as any} />
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Customer:</span> {order.firstName} {order.lastName}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Platform:</span> {order.platform}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Order Date:</span> {formatDate(order.orderDate)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>Needs Review</span>
                    </div>
                    <div className="flex items-center text-blue-600 group-hover:text-blue-800">
                      <span className="text-sm font-medium">Review</span>
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
                  {filteredAndSortedOrders.map((order) => (
                    <tr
                      key={order.orderId}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleOrderClick(order.orderId)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.orderId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.firstName} {order.lastName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                        {order.platform}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={order.status as any} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(order.orderDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center text-blue-600 hover:text-blue-800">
                          <span className="text-sm font-medium">Review</span>
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-12 bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            Review Process
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-700">
            <div className="flex items-start">
              <div className="bg-blue-200 rounded-full p-1 mr-3 mt-0.5">
                <span className="text-xs font-bold text-blue-800">1</span>
              </div>
              <div>
                <p className="font-medium">Pre-Bria Review</p>
                <p>Review generated character and poses before background removal</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-200 rounded-full p-1 mr-3 mt-0.5">
                <span className="text-xs font-bold text-blue-800">2</span>
              </div>
              <div>
                <p className="font-medium">Post-Bria Review</p>
                <p>Review background-removed images from Bria.ai</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-200 rounded-full p-1 mr-3 mt-0.5">
                <span className="text-xs font-bold text-blue-800">3</span>
              </div>
              <div>
                <p className="font-medium">Post-PDF Review</p>
                <p>Review final compiled PDF before production</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
