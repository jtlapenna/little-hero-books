'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Order, OrderListItem } from '@/types/order';
import { StatusBadge } from '@/components/ui/status-badge';
import { DualStatusBadge } from '@/components/ui/dual-status-badge';
import { FlaggedBadge } from '@/components/ui/flagged-badge';
import { formatDate, formatPlatformName } from '@/lib/utils';
import { getOrderListItems } from '@/lib/mock-data';
import { getOrderFlagSummary } from '@/lib/review-state';
import { OrderStatus } from '@/constants/statuses';
import { ArrowRight, Clock, AlertCircle, Search, Grid3X3, List, ChevronDown, RefreshCw } from 'lucide-react';
import { buildOrderListItem } from '@/lib/status-display';
import { REVIEW_TABS, ReviewTabId, getOrdersForTab } from '@/lib/review-page-tabs';

export default function ReviewPage() {
  const router = useRouter();
  const [allOrders, setAllOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ReviewTabId>('poses');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'orderDate' | 'firstName' | 'lastName' | 'platform'>('orderDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

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
      // Build order list items - we'll filter by tab later
      const orderListItems: OrderListItem[] = data
        .filter((order) => order.status !== OrderStatus.COMPLETED)
        .map((order) => buildOrderListItem(order));
      
      setAllOrders(orderListItems);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Fallback to mock data
      const allOrders = getOrderListItems()
        .filter(order => order.rawStatus !== OrderStatus.COMPLETED);
      setAllOrders(allOrders);
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

  // Get orders for the active tab
  const tabOrders = getOrdersForTab(allOrders, activeTab);
  const activeTabConfig = REVIEW_TABS.find(tab => tab.id === activeTab);

  // Filter and sort orders for the active tab
  const filteredAndSortedOrders = tabOrders
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
              <h1 className="text-3xl font-bold text-gray-900">Review Orders</h1>
              <p className="mt-2 text-gray-600">
                Orders requiring human review organized by stage
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                title="Refresh orders"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <span className="text-sm text-gray-500">
                {filteredAndSortedOrders.length} {filteredAndSortedOrders.length === 1 ? 'order' : 'orders'} in {activeTabConfig?.label || 'current tab'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8" aria-label="Review Tabs">
            {REVIEW_TABS.map((tab) => {
              const tabOrderCount = getOrdersForTab(allOrders, tab.id).length;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tabOrderCount > 0 && (
                      <span className={`
                        ml-2 px-2 py-0.5 rounded-full text-xs font-bold
                        ${isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                        }
                      `}>
                        {tabOrderCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
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
                aria-label="Sort by"
              >
                <option value="orderDate">Order Date</option>
                <option value="firstName">First Name</option>
                <option value="lastName">Last Name</option>
                <option value="platform">Platform</option>
              </select>
              
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center"
                aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
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
                title="Card View"
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
                title="List View"
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
              {searchTerm ? 'No orders found' : `No orders in ${activeTabConfig?.label || 'this tab'}`}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm 
                ? 'Try adjusting your search criteria.'
                : activeTabConfig?.description || 'No orders require review in this stage.'
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
              const cardLabel = activeTabConfig?.getCardLabel(order) || 'Pending';
              const flagSummary = getOrderFlagSummary(order);
              const isReadyForApproval = cardLabel === 'Ready for Approval';
              const isReadyForNextStage = cardLabel.startsWith('Ready for') && !isReadyForApproval;
              const isApproved = cardLabel === 'Approved';
              const hasFlags = cardLabel.includes('Flagged');
              
              // Determine card background color based on state
              let cardBgClass = 'bg-white'; // Default: neutral
              let cardBorderClass = 'border border-gray-200';
              
              if (hasFlags) {
                // Flagged Items: Yellow card
                cardBgClass = 'bg-yellow-50';
                cardBorderClass = 'border-2 border-yellow-200';
              } else if (isReadyForNextStage || isApproved) {
                // Approved and ready for next stage: Green card
                cardBgClass = 'bg-green-50';
                cardBorderClass = 'border-2 border-green-200';
              }
              // Ready for Approval: Neutral (white) - already set as default
              
              return (
                <div
                  key={order.orderId}
                  onClick={() => handleOrderClick(order.orderId)}
                  className={`
                    ${cardBgClass} rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer group
                    ${cardBorderClass}
                  `}
                >
                  <div className="flex items-start justify-between mb-4 gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 truncate flex-1 min-w-0">
                      {order.orderId}
                    </h3>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <DualStatusBadge 
                        workflowStatus={order.workflowStatus}
                        technicalStatus={order.technicalStatus}
                        revisionCount={order.revisionCount}
                        errors={order.errors}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Customer:</span> {order.firstName} {order.lastName}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Platform:</span> {formatPlatformName(order.platform)}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Order Date:</span> {formatDate(order.orderDate)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="flex items-center space-x-2">
                      {hasFlags ? (
                        (() => {
                          // Get flag count for the specific stage
                          const stageFlagCount = activeTab === 'secondary' 
                            ? flagSummary.total 
                            : activeTab === 'poses' 
                              ? flagSummary.preBria 
                              : activeTab === 'backgrounds'
                                ? flagSummary.postBria
                                : flagSummary.postPdf;
                          return <FlaggedBadge count={stageFlagCount} />;
                        })()
                      ) : isReadyForApproval ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">
                          ✓ Ready for Approval
                        </span>
                      ) : isReadyForNextStage || isApproved ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">
                          ✓ {cardLabel}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
                          {cardLabel}
                        </span>
                      )}
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
                      Review Status
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
                  {filteredAndSortedOrders.map((order) => {
                    const cardLabel = activeTabConfig?.getCardLabel(order) || 'Pending';
                    const flagSummary = getOrderFlagSummary(order);
                    const isReadyForApproval = cardLabel === 'Ready for Approval';
                    const isReadyForNextStage = cardLabel.startsWith('Ready for') && !isReadyForApproval;
                    const isApproved = cardLabel === 'Approved';
                    const hasFlags = cardLabel.includes('Flagged');
                    
                    // Determine row background color based on state
                    let rowBgClass = 'bg-white'; // Default: neutral
                    
                    if (hasFlags) {
                      // Flagged Items: Yellow row
                      rowBgClass = 'bg-yellow-50 hover:bg-yellow-100';
                    } else if (isReadyForNextStage || isApproved) {
                      // Approved and ready for next stage: Green row
                      rowBgClass = 'bg-green-50 hover:bg-green-100';
                    }
                    // Ready for Approval: Neutral (white) - already set as default
                    
                    return (
                      <tr
                        key={order.orderId}
                        className={`${rowBgClass} cursor-pointer`}
                        onClick={() => handleOrderClick(order.orderId)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {order.orderId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.firstName} {order.lastName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatPlatformName(order.platform)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <DualStatusBadge 
                            workflowStatus={order.workflowStatus}
                            technicalStatus={order.technicalStatus}
                            revisionCount={order.revisionCount}
                            errors={order.errors}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {hasFlags ? (
                            (() => {
                              // Get flag count for the specific stage
                              const stageFlagCount = activeTab === 'secondary' 
                                ? flagSummary.total 
                                : activeTab === 'poses' 
                                  ? flagSummary.preBria 
                                  : activeTab === 'backgrounds'
                                    ? flagSummary.postBria
                                    : flagSummary.postPdf;
                              return <FlaggedBadge count={stageFlagCount} />;
                            })()
                          ) : isReadyForApproval ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">
                              ✓ Ready for Approval
                            </span>
                          ) : isReadyForNextStage || isApproved ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">
                              ✓ {cardLabel}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
                              {cardLabel}
                            </span>
                          )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
