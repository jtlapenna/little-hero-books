'use client';

import { SiblingOrderSummary } from '@/types/order';

interface SiblingGroupPanelProps {
  rootOrderId?: string;
  platform?: string;
  totalSiblings?: number;
  itemNumber?: number;
  siblingOrders?: SiblingOrderSummary[];
  currentOrderId: string;
  showManifestWarning?: boolean;
  onSelectSibling: (orderId: string) => void;
}

function getPlatformLabel(platform?: string): string {
  if (platform === 'd2c') return 'D2C (Website)';
  if (!platform) return 'Unknown';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function getPlatformClasses(platform?: string): string {
  return platform === 'd2c'
    ? 'bg-purple-100 text-purple-800'
    : 'bg-orange-100 text-orange-800';
}

function getSiblingStatusLabel(sibling: SiblingOrderSummary): string {
  return sibling.executionStatus || sibling.workflowStep || 'Unknown';
}

export function SiblingGroupPanel({
  rootOrderId,
  platform,
  totalSiblings,
  itemNumber,
  siblingOrders = [],
  currentOrderId,
  showManifestWarning: _showManifestWarning = false,
  onSelectSibling,
}: SiblingGroupPanelProps) {
  const resolvedTotal = totalSiblings ?? siblingOrders.length;
  const showNavigation = siblingOrders.length > 1;
  const showItemLabel =
    typeof itemNumber === 'number' && resolvedTotal > 0;

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-indigo-900">
                Multi-book order
              </span>
              {showItemLabel && (
                <span className="text-sm text-indigo-800">
                  Item {itemNumber} of {resolvedTotal}
                </span>
              )}
            </div>
            {rootOrderId && (
              <p className="mt-2 text-sm text-indigo-900">
                Root:{' '}
                <span className="font-mono text-xs sm:text-sm bg-white/70 border border-indigo-100 rounded px-2 py-1">
                  {rootOrderId}
                </span>
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPlatformClasses(platform)}`}
          >
            {getPlatformLabel(platform)}
          </span>
        </div>
      </div>

      {showNavigation && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap gap-3">
            {siblingOrders.map((sibling) => {
              const isCurrent =
                sibling.isCurrent || sibling.orderId === currentOrderId;

              return (
                <button
                  key={sibling.orderId}
                  type="button"
                  onClick={() => {
                    if (!isCurrent) {
                      onSelectSibling(sibling.orderId);
                    }
                  }}
                  disabled={isCurrent}
                  className={`min-w-[160px] rounded-lg border px-4 py-3 text-left transition-colors ${
                    isCurrent
                      ? 'border-indigo-300 bg-indigo-50 cursor-default'
                      : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 break-all">
                      {sibling.displayOrderId || sibling.orderId}
                    </p>
                    {isCurrent && (
                      <span className="text-[11px] font-medium uppercase tracking-wide text-indigo-700">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    {getSiblingStatusLabel(sibling)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
