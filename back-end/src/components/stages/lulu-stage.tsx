'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  X,
  Copy,
  Package,
  Calendar,
  DollarSign,
  Truck,
  Clock,
} from 'lucide-react';
import { Order } from '@/types/order';
import { LuluStatus } from '@/constants/statuses';
import { formatDate } from '@/lib/utils';

interface LuluStageProps {
  orderId: string;
  order: Order;
  onRefresh?: () => void;
  onRefreshStatus?: () => Promise<void>;
  onCancelOrder?: () => Promise<void>;
}

// Get status badge color, label, icon, and Tailwind classes
function getStatusDisplay(status?: string) {
  if (!status) {
    return { 
      label: 'Unknown', 
      icon: AlertCircle,
      badgeClasses: 'bg-gray-100 text-gray-800 border-gray-200',
      iconClasses: 'text-gray-600'
    };
  }

  switch (status) {
    case LuluStatus.CREATED:
    case LuluStatus.UNPAID:
    case LuluStatus.PAYMENT_IN_PROGRESS:
    case LuluStatus.PRODUCTION_DELAYED:
    case LuluStatus.PRODUCTION_READY:
      return { 
        label: 'Preparing for Print', 
        icon: Clock,
        badgeClasses: 'bg-blue-100 text-blue-800 border-blue-200',
        iconClasses: 'text-blue-600'
      };
    case LuluStatus.IN_PRODUCTION:
      return { 
        label: 'In Production', 
        icon: Package,
        badgeClasses: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        iconClasses: 'text-indigo-600'
      };
    case LuluStatus.SHIPPED:
      return { 
        label: 'Shipped', 
        icon: Truck,
        badgeClasses: 'bg-green-100 text-green-800 border-green-200',
        iconClasses: 'text-green-600'
      };
    case LuluStatus.DELIVERED:
      return { 
        label: 'Delivered', 
        icon: CheckCircle,
        badgeClasses: 'bg-green-100 text-green-800 border-green-200',
        iconClasses: 'text-green-600'
      };
    case LuluStatus.REJECTED:
      return { 
        label: 'Rejected', 
        icon: AlertCircle,
        badgeClasses: 'bg-red-100 text-red-800 border-red-200',
        iconClasses: 'text-red-600'
      };
    case LuluStatus.CANCELED:
      return { 
        label: 'Canceled', 
        icon: X,
        badgeClasses: 'bg-gray-100 text-gray-800 border-gray-200',
        iconClasses: 'text-gray-600'
      };
    default:
      return { 
        label: status, 
        icon: AlertCircle,
        badgeClasses: 'bg-gray-100 text-gray-800 border-gray-200',
        iconClasses: 'text-gray-600'
      };
  }
}

// Check if order can be canceled (only UNPAID status allows cancellation)
function canCancelOrder(status?: string): boolean {
  return status === LuluStatus.UNPAID;
}

export function LuluStage({
  orderId,
  order,
  onRefresh,
  onRefreshStatus,
  onCancelOrder,
}: LuluStageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = order.luluStatus;
  const statusDisplay = getStatusDisplay(status);
  const StatusIcon = statusDisplay.icon;

  const handleRefreshStatus = async () => {
    if (!onRefreshStatus) return;
    
    setRefreshing(true);
    setError(null);
    try {
      await onRefreshStatus();
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to refresh status');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!onCancelOrder || !canCancelOrder(status)) return;
    
    if (!confirm('Are you sure you want to cancel this print job? This action cannot be undone.')) {
      return;
    }

    setCanceling(true);
    setError(null);
    try {
      await onCancelOrder();
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
    } finally {
      setCanceling(false);
    }
  };

  const handleCopyJobId = () => {
    if (!order.luluJobId) return;
    navigator.clipboard.writeText(order.luluJobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLuluDashboardUrl = () => {
    if (!order.luluJobId) return null;
    // Lulu developer dashboard URL
    return 'https://developers.lulu.com/print-jobs';
  };

  const luluDashboardUrl = getLuluDashboardUrl();

  if (!order.luluJobId) {
    return (
      <div className="text-center py-12">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">No Print Job Found</h3>
        <p className="mt-2 text-sm text-gray-500">
          This order has not been submitted to Lulu yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Status Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Print Job Status</h3>
            <p className="mt-1 text-sm text-gray-500">Current status of your Lulu print job</p>
          </div>
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border ${statusDisplay.badgeClasses}`}>
            <StatusIcon className={`h-4 w-4 mr-2 ${statusDisplay.iconClasses}`} />
            {statusDisplay.label}
          </div>
        </div>
      </div>

      {/* Job Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Information</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Lulu Job ID</dt>
            <dd className="mt-1 flex items-center text-sm text-gray-900">
              <span className="font-mono">{order.luluJobId}</span>
              <button
                onClick={handleCopyJobId}
                className="ml-2 text-gray-400 hover:text-gray-600"
                title="Copy Job ID"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </dd>
          </div>

          {order.luluSubmittedAt && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Submitted</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(order.luluSubmittedAt)}
              </dd>
            </div>
          )}

          {order.luluCost !== undefined && order.luluCost !== null && (
            <div>
              <dt className="text-sm font-medium text-gray-500 flex items-center">
                <DollarSign className="h-4 w-4 mr-1" />
                Cost
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                ${order.luluCost.toFixed(2)}
              </dd>
            </div>
          )}

          {order.luluEstimatedShipDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500 flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Estimated Ship Date
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(order.luluEstimatedShipDate)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Tracking Section (when shipped or delivered) */}
      {(status === LuluStatus.SHIPPED || status === LuluStatus.DELIVERED) && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Truck className="h-5 w-5 mr-2 text-green-600" />
            Tracking Information
          </h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {order.luluTrackingNumber && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Tracking Number</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">
                  {order.luluTrackingNumber}
                </dd>
              </div>
            )}

            {order.luluCarrier && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Carrier</dt>
                <dd className="mt-1 text-sm text-gray-900">{order.luluCarrier}</dd>
              </div>
            )}

            {order.luluTrackingUrl && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Tracking URL</dt>
                <dd className="mt-1">
                  <a
                    href={order.luluTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    {order.luluTrackingUrl}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Error Details (if rejected) */}
      {status === LuluStatus.REJECTED && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Order Rejected</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>This print job was rejected by Lulu. Please review the error details and contact support if needed.</p>
                {order.errorMessage && (
                  <p className="mt-2 font-mono text-xs bg-red-100 p-2 rounded">
                    {order.errorMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRefreshStatus}
            disabled={refreshing || !onRefreshStatus}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </>
            )}
          </button>

          {luluDashboardUrl && (
            <a
              href={luluDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View in Lulu Dashboard
            </a>
          )}

          {canCancelOrder(status) && onCancelOrder && (
            <button
              onClick={handleCancelOrder}
              disabled={canceling}
              className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {canceling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Canceling...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Cancel Order
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

