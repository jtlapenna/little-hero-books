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
import { useState as useStateReact, useEffect as useEffectReact } from 'react';
import { ArrowLeft, User, Calendar, Package, Flag } from 'lucide-react';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<ReviewStage>('preBria' as unknown as ReviewStage);
  const [flagCounts, setFlagCounts] = useStateReact({ preBria: 0, postBria: 0, postPdf: 0 });

  useEffect(() => {
    const orderId = params.orderId as string;
    if (orderId) {
      // Fetch order from API
      fetch(`/api/orders/${orderId}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch order');
          }
          return response.json();
        })
        .then(data => {
          console.log('OrderDetailPage: Received order data:', data);
          console.log('OrderDetailPage: R2 assets:', data.r2Assets);
          console.log('OrderDetailPage: R2 base character:', data.r2Assets?.baseCharacter);
          console.log('OrderDetailPage: R2 poses count:', data.r2Assets?.poses?.length);
          setOrder(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Error fetching order:', error);
          // Fallback to mock data
          const foundOrder = getOrderById(orderId);
          setOrder(foundOrder || null);
          setLoading(false);
        });
    }
  }, [params.orderId]);

  // Update flag counts when order changes
  useEffectReact(() => {
    if (order) {
      const updateFlagCounts = () => {
        setFlagCounts({
          preBria: getStageFlaggedCount(order.orderId, 'preBria'),
          postBria: getStageFlaggedCount(order.orderId, 'postBria'),
          postPdf: getStageFlaggedCount(order.orderId, 'postPdf')
        });
      };
      
      updateFlagCounts();
      
      // Set up interval to check for flag count changes
      const interval = setInterval(updateFlagCounts, 500);
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

  const handleStageApprove = async (stage: ReviewStage) => {
    if (!order) return;

    try {
      // Call the API to approve the stage
      const response = await fetch(`/api/orders/${order.orderId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve stage');
      }

      const result = await response.json();
      console.log('Stage approval result:', result);

      // Re-fetch the order data to get the updated status from the server
      try {
        const orderResponse = await fetch(`/api/orders/${order.orderId}`);
        if (orderResponse.ok) {
          const updatedOrder = await orderResponse.json();
          setOrder(updatedOrder);
          console.log('Order data refreshed after approval:', updatedOrder.reviewStages);
        }
      } catch (fetchError) {
        console.error('Error re-fetching order data:', fetchError);
        // Fallback to local state update if re-fetch fails
        setOrder(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            reviewStages: {
              ...prev.reviewStages,
              [stage as unknown as string]: {
                ...prev.reviewStages[stage as unknown as keyof typeof prev.reviewStages],
                status: 'approved',
                reviewedAt: new Date().toISOString(),
                reviewer: 'jeff@thepeakbeyond.com'
              }
            }
          }
        });
      }

    } catch (error) {
      console.error('Error approving stage:', error);
      // You could add a toast notification here to show the error
      alert('Failed to approve stage. Please try again.');
    }
  };

  const handleInitiateWorkflow = (stage: ReviewStage) => {
    console.log(`Initiating workflow for stage: ${stage}`);
    // In real implementation, this would trigger the appropriate n8n workflow
    // For now, we'll just log it
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
          
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold text-gray-900 truncate">{order.orderId}</h1>
              <p className="text-gray-600 mt-1">
                {order.customer.firstName} {order.customer.lastName} • {order.platform}
              </p>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              {flagCounts.preBria + flagCounts.postBria + flagCounts.postPdf > 0 && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 whitespace-nowrap">
                  <Flag className="h-4 w-4 mr-1" />
                  {flagCounts.preBria + flagCounts.postBria + flagCounts.postPdf} {flagCounts.preBria + flagCounts.postBria + flagCounts.postPdf === 1 ? 'Needs' : 'Need'} Attention
                </span>
              )}
              <StatusBadge status={order.status as any} />
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
            
            {order.status === 'ai_generation_in_progress' && (
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
                        status={order.reviewStages[stage.key as unknown as keyof typeof order.reviewStages].status} 
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
                  isApproved={order.reviewStages.preBria.status === 'approved'}
                  onApprove={async () => await handleStageApprove('preBria' as unknown as ReviewStage)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('preBria' as unknown as ReviewStage)}
                />
              )}
              
              {activeStage === ('postBria' as unknown as ReviewStage) && (
                <PostBriaStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.postBria.status === 'approved'}
                  onApprove={async () => await handleStageApprove('postBria' as unknown as ReviewStage)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('postBria' as unknown as ReviewStage)}
                />
              )}
              
              {activeStage === ('postPdf' as unknown as ReviewStage) && (
                <PostPdfStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.postPdf.status === 'approved'}
                  onApprove={async () => await handleStageApprove('postPdf' as unknown as ReviewStage)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('postPdf' as unknown as ReviewStage)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
