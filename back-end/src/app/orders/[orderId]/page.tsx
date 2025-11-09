'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Order, ReviewStage } from '@/types/order';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, getInitials } from '@/lib/utils';
import { getOrderById } from '@/lib/mock-data';
import { PreBriaStage } from '@/components/stages/pre-bria-stage';
import { PostBriaStage } from '@/components/stages/post-bria-stage';
import { PostPdfStage } from '@/components/stages/post-pdf-stage';
import { getStageFlaggedCount, getOrderFlagSummary } from '@/lib/review-state';
import { ReviewStageStatus, OrderStatus } from '@/constants/statuses';
import { useState as useStateReact, useEffect as useEffectReact } from 'react';
import { ArrowLeft, User, Calendar, Package, Flag, RotateCcw, Loader2 } from 'lucide-react';

interface FinalApprovalResult {
  previewUrl: string;
  token: string;
  requestedAt?: string;
  tokenCreated?: boolean;
  notification?: {
    attempted: boolean;
    sent: boolean;
    reason?: string;
    response?: unknown;
  };
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<ReviewStage>('preBria' as unknown as ReviewStage);
  const [flagCounts, setFlagCounts] = useStateReact({ preBria: 0, postBria: 0, postPdf: 0 });
  const [finalApprovalResult, setFinalApprovalResult] = useState<FinalApprovalResult | null>(null);
  const [finalApprovalError, setFinalApprovalError] = useState<string | null>(null);
  const [finalApprovalLoading, setFinalApprovalLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const enableResetButton =
    (process.env.NEXT_PUBLIC_ENABLE_ORDER_RESET || 'false') === 'true' ||
    process.env.NODE_ENV !== 'production';

  // Fetch order data from API
  const fetchOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }
      const data = await response.json();
      console.log('OrderDetailPage: Received order data:', data);
      console.log('OrderDetailPage: R2 assets:', data.r2Assets);
      console.log('OrderDetailPage: R2 base character:', data.r2Assets?.baseCharacter);
      console.log('OrderDetailPage: R2 poses count:', data.r2Assets?.poses?.length);
      console.log('OrderDetailPage: R2 post-Bria poses count:', data.r2Assets?.posesBgRemoved?.length);
      setOrder(data);
      setLoading(false);
      return data;
    } catch (error) {
      console.error('Error fetching order:', error);
      // Fallback to mock data
      const foundOrder = getOrderById(orderId);
      setOrder(foundOrder || null);
      setLoading(false);
      return foundOrder;
    }
  };

  useEffect(() => {
    const orderId = params.orderId as string;
    if (orderId) {
      setFinalApprovalResult(null);
      setFinalApprovalError(null);
      setFinalApprovalLoading(false);
      fetchOrder(orderId);
    }
  }, [params.orderId]);

  // Refresh handler for PostBriaStage
  const handleRefreshOrder = async () => {
    const orderId = params.orderId as string;
    if (orderId) {
      await fetchOrder(orderId);
    }
  };

  // Update flag counts when order changes
  useEffectReact(() => {
    if (order) {
      const updateFlagCounts = async () => {
        try {
          const [preBria, postBria, postPdf] = await Promise.all([
            getStageFlaggedCount(order.orderId, 'preBria'),
            getStageFlaggedCount(order.orderId, 'postBria'),
            getStageFlaggedCount(order.orderId, 'postPdf')
          ]);
          setFlagCounts({ preBria, postBria, postPdf });
        } catch (error) {
          console.error('Error updating flag counts:', error);
        }
      };
      
      updateFlagCounts();
      
      // Set up interval to check for flag count changes
      const interval = setInterval(updateFlagCounts, 5000); // Increased to 5 seconds to reduce API calls
      return () => clearInterval(interval);
    }
  }, [order]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-8">The order you're looking for doesn't exist.</p>
          <button
            onClick={() => router.push('/orders')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const stages: { key: ReviewStage; label: string; description: string }[] = [
    {
      key: 'preBria' as unknown as ReviewStage,
      label: 'Pre-Bria',
      description: 'Generated character + poses before background removal'
    },
    {
      key: 'postBria' as unknown as ReviewStage,
      label: 'Post-Bria',
      description: 'Background-removed images from Bria.ai'
    },
    {
      key: 'postPdf' as unknown as ReviewStage,
      label: 'Post-PDF',
      description: 'Final compiled PDF ready for production'
    }
  ];

  const handleStageApprove = async (stage: ReviewStage, explicitStatus?: 'approved' | 'pending') => {
    if (!order) return;

    try {
      const stageKey = stage as unknown as keyof typeof order.reviewStages;
      const currentStatus = order.reviewStages[stageKey]?.status || 'pending';
      const nextStatus = explicitStatus || (currentStatus === 'approved' ? 'pending' : 'approved');

      const response = await fetch(`/api/orders/${order.orderId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage, status: nextStatus }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to update stage' }));
        throw new Error(error?.error || 'Failed to update stage');
      }

      const result = await response.json();
      console.log('Stage approval result:', result);

      setOrder(prev => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          reviewStages: {
            ...prev.reviewStages,
            ...(result?.reviewStages || prev.reviewStages),
          }
        };
        return updated;
      });

    } catch (error) {
      console.error('Error approving stage:', error);
      // You could add a toast notification here to show the error
      alert((error as Error)?.message || 'Failed to update stage. Please try again.');
    }
  };

  const handleInitiateWorkflow = async (stage: ReviewStage) => {
    if (!order) return;
    
    console.log(`Initiating workflow for stage: ${stage}`);
    
    // Only trigger background removal for preBria stage
    if (stage === ('preBria' as unknown as ReviewStage)) {
      try {
        const response = await fetch(`/api/orders/${order.orderId}/trigger-background-removal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || 'Failed to trigger background removal workflow');
        }

        const result = await response.json();
        console.log('Background removal workflow triggered:', result);
        
        // Show success message (you could add a toast notification here)
        alert('Background removal workflow triggered successfully!');
      } catch (error: any) {
        console.error('Error triggering background removal workflow:', error);
        alert(`Failed to trigger background removal: ${error?.message || error}`);
      }

      return;
    }

    if (stage === ('postPdf' as unknown as ReviewStage)) {
      try {
        setFinalApprovalError(null);
        setFinalApprovalLoading(true);

        const response = await fetch(`/api/orders/${order.orderId}/final-approval`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reviewer: 'Admin reviewer'
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error || 'Failed to initiate customer preview.');
        }

        setFinalApprovalResult({
          previewUrl: result.previewUrl,
          token: result.token,
          requestedAt:
            result.requestedAt ||
            result.order?.customerApprovalRequestedAt ||
            new Date().toISOString(),
          tokenCreated: result.tokenCreated,
          notification: result.notification
        });

        if (result.order) {
          setOrder(result.order);
        } else {
          await fetchOrder(order.orderId);
        }
      } catch (error: any) {
        console.error('Error sending preview to customer:', error);
        setFinalApprovalError(error?.message || 'Failed to create customer preview.');
      } finally {
        setFinalApprovalLoading(false);
      }

      return;
    }
  };

  const handleResetOrder = async () => {
    if (!order) return;
    const confirmed = window.confirm(
      'Reset this order to its initial state? This will clear review approvals, customer preview links, and revision history.'
    );
    if (!confirmed) {
      return;
    }

    try {
      setResetting(true);
      setFinalApprovalError(null);

      const response = await fetch(`/api/orders/${order.orderId}/reset`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || 'Failed to reset order');
      }

      await fetchOrder(order.orderId);
      setFinalApprovalResult(null);
      setFinalApprovalError(null);
      setFinalApprovalLoading(false);
      setActiveStage('preBria' as unknown as ReviewStage);
      setFlagCounts({ preBria: 0, postBria: 0, postPdf: 0 });

      alert('Order reset successfully. You can now re-run the review workflow.');
    } catch (error: any) {
      console.error('Error resetting order:', error);
      alert(error?.message || 'Failed to reset order. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/orders')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </button>
          
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold text-gray-900 truncate">{order.orderId}</h1>
              <p className="text-gray-600 mt-1">
                {order.customer.firstName} {order.customer.lastName} • {order.platform}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {flagCounts.preBria + flagCounts.postBria + flagCounts.postPdf > 0 && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 whitespace-nowrap">
                  <Flag className="h-4 w-4 mr-1" />
                  {flagCounts.preBria + flagCounts.postBria + flagCounts.postPdf} {flagCounts.preBria + flagCounts.postBria + flagCounts.postPdf === 1 ? 'Needs' : 'Need'} Attention
                </span>
              )}
              {/* Show stage status badge for current active stage */}
              {order.reviewStages && (
                <StatusBadge 
                  status={
                    order.reviewStages[activeStage as unknown as keyof typeof order.reviewStages]?.status === 'approved' 
                      ? ReviewStageStatus.APPROVED 
                      : ReviewStageStatus.PENDING
                  } 
                />
              )}
              <StatusBadge status={order.status as any} />
              {enableResetButton && (
                <button
                  type="button"
                  onClick={handleResetOrder}
                  disabled={resetting}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                  title="Reset order to initial state (development only)"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset Order (Dev)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Order Information Banner */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          {/* Status & Progress Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Order Status</h2>
              <StatusBadge status={order.status as any} />
            </div>
            
            {order.status === OrderStatus.AI_GENERATION_IN_PROGRESS && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">AI Generation in Progress</p>
                    <p className="text-sm text-blue-700">
                      Character assets are being generated. This process typically takes 10-30 minutes.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-700">Started: {order.aiGenerationStartedAt ? formatDate(order.aiGenerationStartedAt) : 'N/A'}</p>
                    <p className="text-xs text-blue-600">
                      Elapsed: {order.aiGenerationStartedAt ? 
                        Math.floor((new Date().getTime() - new Date(order.aiGenerationStartedAt).getTime()) / (1000 * 60)) + ' minutes' : 
                        'Unknown'
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Character & Book Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Character Information */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Character Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Child's Name</p>
                  <p className="text-sm text-gray-600">{order.characterSpecs?.childName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Age</p>
                  <p className="text-sm text-gray-600">{order.characterSpecs?.age || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Skin Tone</p>
                  <p className="text-sm text-gray-600 capitalize">{order.characterSpecs?.skinTone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Hair</p>
                  <p className="text-sm text-gray-600 capitalize">{order.characterSpecs?.hairColor || 'N/A'} {order.characterSpecs?.hairStyle || ''}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Animal Guide</p>
                  <p className="text-sm text-gray-600 capitalize">{order.characterSpecs?.animalGuide || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Clothing</p>
                  <p className="text-sm text-gray-600 capitalize">{order.characterSpecs?.clothingStyle || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Book & Order Information */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Book & Order Info</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Book Title</p>
                  <p className="text-sm text-gray-600">{order.bookSpecs?.title || 'N/A'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Format</p>
                    <p className="text-sm text-gray-600">{order.bookSpecs?.format || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Pages</p>
                    <p className="text-sm text-gray-600">{order.bookSpecs?.totalPages || 'N/A'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Customer</p>
                  <p className="text-sm text-gray-600">{order.customerEmail || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Order Date</p>
                  <p className="text-sm text-gray-600">{formatDate(order.orderDate)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Details (Collapsible) */}
          {(order.characterHash || order.characterPath) && (
            <div className="border-t border-gray-200 pt-4">
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  Technical Details
                  <span className="ml-2 text-xs text-gray-500 group-open:hidden">(click to expand)</span>
                </summary>
                <div className="mt-3 space-y-2 text-xs text-gray-600">
                  {order.characterHash && (
                    <div>
                      <span className="font-medium">Character Hash:</span> {order.characterHash}
                    </div>
                  )}
                  {order.characterPath && (
                    <div>
                      <span className="font-medium">Character Path:</span> {order.characterPath}
                    </div>
                  )}
                  {order.templatePath && (
                    <div>
                      <span className="font-medium">Template Path:</span> {order.templatePath}
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Review Stages - Full Width */}
        <div className="w-full">
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Review Stages</h2>
              <p className="text-gray-600 mt-1">Review assets at each stage of the production process</p>
            </div>

            {/* Stage Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6">
                {stages.map((stage) => (
                  <button
                    key={stage.key as unknown as string}
                    onClick={() => setActiveStage(stage.key)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeStage === stage.key
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span>{stage.label}</span>
                      <StatusBadge 
                        status={
                          order.reviewStages[stage.key as unknown as keyof typeof order.reviewStages]?.status === ReviewStageStatus.APPROVED
                            ? ReviewStageStatus.APPROVED
                            : order.reviewStages[stage.key as unknown as keyof typeof order.reviewStages]?.status || ReviewStageStatus.PENDING
                        } 
                      />
                      {flagCounts[stage.key as unknown as keyof typeof flagCounts] > 0 && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                          {flagCounts[stage.key as unknown as keyof typeof flagCounts]}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </nav>
            </div>

            {/* Stage Content */}
            <div className="p-6">
              {activeStage === ('preBria' as unknown as ReviewStage) && (
                <PreBriaStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.preBria.status === ReviewStageStatus.APPROVED}
                  onApprove={async (status) => await handleStageApprove('preBria' as unknown as ReviewStage, status)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('preBria' as unknown as ReviewStage)}
                  onRefresh={handleRefreshOrder}
                />
              )}
              
              {activeStage === ('postBria' as unknown as ReviewStage) && (
                <PostBriaStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.postBria.status === ReviewStageStatus.APPROVED}
                  onApprove={async (status) => await handleStageApprove('postBria' as unknown as ReviewStage, status)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('postBria' as unknown as ReviewStage)}
                  onRefresh={handleRefreshOrder}
                />
              )}
              
              {activeStage === ('postPdf' as unknown as ReviewStage) && (
                <PostPdfStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.postPdf.status === ReviewStageStatus.APPROVED}
                  onApprove={async (status) => await handleStageApprove('postPdf' as unknown as ReviewStage, status)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('postPdf' as unknown as ReviewStage)}
                  onRefresh={handleRefreshOrder}
                  finalApprovalResult={finalApprovalResult}
                  finalApprovalError={finalApprovalError}
                  finalApprovalLoading={finalApprovalLoading}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
