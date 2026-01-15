'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Order, ReviewStage } from '@/types/order';
import { StatusBadge } from '@/components/ui/status-badge';
import { DualStatusBadge } from '@/components/ui/dual-status-badge';
import { FlaggedBadge } from '@/components/ui/flagged-badge';
import { formatDate, getInitials } from '@/lib/utils';
import { getOrderById } from '@/lib/mock-data';
import { PreBriaStage } from '@/components/stages/pre-bria-stage';
import { PostBriaStage } from '@/components/stages/post-bria-stage';
import { PostPdfStage } from '@/components/stages/post-pdf-stage';
import { LuluStage } from '@/components/stages/lulu-stage';
import { getStageFlaggedCount, getOrderFlagSummary } from '@/lib/review-state';
import { ReviewStageStatus, OrderStatus } from '@/constants/statuses';
import { useState as useStateReact, useEffect as useEffectReact } from 'react';
import { ArrowLeft, User, Calendar, Package, Flag, RotateCcw, Loader2, Printer } from 'lucide-react';
import { getDisplayStatusForOrder, getStageBadgeStatus } from '@/lib/status-display';
import { ManualReviewAlert } from '@/components/ui/manual-review-alert';

const correctionReasonLabels: Record<string, string> = {
  name_typo: 'Name typo',
  hairStyle_wrong: 'Hair style wrong',
  hairColor_wrong: 'Hair color wrong',
  skinTone_wrong: 'Skin tone wrong',
  pronouns_wrong: 'Pronouns wrong',
  animalGuide_wrong: 'Animal guide wrong',
  favoriteColor_wrong: 'Favorite color wrong',
  clothingStyle_wrong: 'Clothing style wrong',
  dedication_fix: 'Dedication update',
  hometown_fix: 'Hometown update',
  favoriteFood_fix: 'Favorite food update',
  age_wrong: 'Age incorrect',
  visual_issue: 'Visual issue',
  other: 'Other feedback',
};

function formatReasonLabel(reason?: string | null): string {
  if (!reason) return 'Correction requested';
  return (
    correctionReasonLabels[reason] ||
    reason
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function formatFieldLabel(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCorrectionValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    if (value.includes('@') || /^https?:\/\//i.test(value) || /[A-Z]/.test(value)) {
      return value;
    }
    return value
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return String(value);
}

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
  const [manualPrintLoading, setManualPrintLoading] = useState(false);
  const [creatingManifest, setCreatingManifest] = useState(false);
  const [creating2aManifest, setCreating2aManifest] = useState(false);
  const [creating2bManifest, setCreating2bManifest] = useState(false);
  const [resettingOrder, setResettingOrder] = useState(false);
  const [normalizingShipping, setNormalizingShipping] = useState(false);
  const printRequestInProgressRef = useRef(false);
  const rawResetToggle = process.env.NEXT_PUBLIC_ENABLE_ORDER_RESET;
  const enableResetButton =
    rawResetToggle === undefined
      ? true
      : !['false', '0', 'off'].includes(String(rawResetToggle).toLowerCase());

  // Fetch order data from API
  const fetchOrder = async (orderId: string) => {
    try {
      // Add cache-busting to ensure we get fresh data after manifest deletions
      const response = await fetch(`/api/orders/${orderId}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      // Read response body once - can't read it twice in Cloudflare Workers
      const responseText = await response.text();
      let data: any;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok) {
        let errorMessage = 'Failed to fetch order';
        try {
          const errorJson = typeof data === 'object' ? data : JSON.parse(responseText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        console.error(`[OrderDetailPage] API error (${response.status}):`, errorMessage);
        throw new Error(errorMessage);
      }
      setOrder(data);
      
      // Initialize flagCounts from order.flags if available (for immediate UI update)
      if (data.flags) {
        setFlagCounts({
          preBria: data.flags.preBria || 0,
          postBria: data.flags.postBria || 0,
          postPdf: data.flags.postPdf || 0,
        });
      }
      
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

  // Callback to update order state and sync flagCounts
  const handleOrderUpdate = useCallback((updates: Partial<Order>) => {
    setOrder(prev => {
      if (!prev) return prev;
      
      // Merge updates properly, especially for reviewStages
      // Create new object references to ensure React detects changes
      const updatedReviewStages = updates.reviewStages 
        ? {
            ...prev.reviewStages,
            ...updates.reviewStages,
          }
        : prev.reviewStages;
      
      const updatedOrder: Order = {
        ...prev,
        ...(updates.flags && { flags: updates.flags }),
        reviewStages: updatedReviewStages,
      };
      
      // Sync flagCounts state with order.flags for immediate UI update
      if (updates.flags) {
        const newFlagCounts = {
          preBria: updates.flags.preBria || 0,
          postBria: updates.flags.postBria || 0,
          postPdf: updates.flags.postPdf || 0,
        };
        setFlagCounts(newFlagCounts);
      }
      
      return updatedOrder;
    });
  }, []);

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

  const handleSendToPrint = useCallback(
    async (source: 'manual-admin' | 'post-pdf-stage' | 'customer-approval') => {
      if (!order) {
        throw new Error('Order is not loaded');
      }


      const response = await fetch(`/api/orders/${order.orderId}/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ source })
      });


      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        console.error('[SendToPrint] Error response:', errorBody);
        throw new Error(errorBody?.error || `Failed to trigger print workflow: ${response.status} ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      return result;
    },
    [order]
  );

  // Handler for refreshing Lulu status
  const handleRefreshLuluStatus = useCallback(async () => {
    if (!order?.orderId) {
      throw new Error('Order is not loaded');
    }

    const response = await fetch(`/api/admin/orders/${order.orderId}/refresh-lulu-status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error || `Failed to refresh Lulu status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json().catch(() => null);
    return result;
  }, [order]);

  // Handler for canceling Lulu order
  const handleCancelLuluOrder = useCallback(async () => {
    if (!order?.orderId) {
      throw new Error('Order is not loaded');
    }

    const response = await fetch(`/api/admin/orders/${order.orderId}/cancel-lulu-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error || `Failed to cancel Lulu order: ${response.status} ${response.statusText}`);
    }

    const result = await response.json().catch(() => null);
    return result;
  }, [order]);

  // Update flag counts when orderId changes (not when order object changes)
  // Calculate directly from manifests (source of truth) rather than Supabase
  useEffectReact(() => {
    const orderId = params.orderId as string;
    if (!orderId) return;
    
      const updateFlagCounts = async () => {
        try {
          let preBria = 0;
          let postBria = 0;
          let postPdf = 0;
          
          // Load 2a manifest for preBria flags
          try {
            const manifest2aUrl = `/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json?v=${Date.now()}`;
            const res2a = await fetch(manifest2aUrl, { cache: 'no-store' });
            if (res2a.ok) {
              const manifest2a = await res2a.json();
              const entries2a = manifest2a?.entries || [];
              preBria = entries2a.filter((e: any) => e.isFlagged || e.needsReview).length;
            }
          } catch (err) {
          // Silently handle - 404 is expected
          }
          
          // Load 2b manifest for postBria flags (fallback to 2a if 2b doesn't exist)
          try {
            let manifest2bUrl = `/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/2b-manifest.json?v=${Date.now()}`;
            let res2b = await fetch(manifest2bUrl, { cache: 'no-store' });
            if (!res2b.ok && res2b.status === 404) {
              manifest2bUrl = `/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json?v=${Date.now()}`;
              res2b = await fetch(manifest2bUrl, { cache: 'no-store' });
            }
            if (res2b.ok) {
              const manifest2b = await res2b.json();
              const entries2b = manifest2b?.entries || [];
              postBria = entries2b.filter((e: any) => e.isFlagged || e.needsReview).length;
            }
          } catch (err) {
          // Silently handle - 404 is expected
          }
          
          // Load 3 manifest for postPdf flags
          try {
            const manifest3Url = `/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json?v=${Date.now()}`;
            const res3 = await fetch(manifest3Url, { cache: 'no-store' });
            if (res3.ok) {
              const manifest3 = await res3.json();
              const pagesMetadata = manifest3?.pngGeneration?.pagesMetadata || manifest3?.manifest?.pngGeneration?.pagesMetadata || {};
              postPdf = Object.values(pagesMetadata).filter((meta: any) => meta.isFlagged || meta.needsReview).length;
            }
          } catch (err) {
          // Silently handle - 404 is expected
          }
          
          setFlagCounts({ preBria, postBria, postPdf });
        } catch (error) {
        // Silently handle errors
        }
      };
      
    // Initial update
      updateFlagCounts();
      
      // Set up interval to check for flag count changes (polling for updates)
    // Only poll every 10 seconds to reduce load
    const interval = setInterval(updateFlagCounts, 10000);
      return () => clearInterval(interval);
  }, [params.orderId]); // Only depend on orderId, not the entire order object

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

  const stages: { key: ReviewStage; label: string; description: string; stageKey: 'preBria' | 'postBria' | 'postPdf' | 'lulu' }[] = [
    {
      key: 'preBria' as unknown as ReviewStage,
      label: 'Review Poses',
      description: 'Generated character + poses before background removal',
      stageKey: 'preBria'
    },
    {
      key: 'postBria' as unknown as ReviewStage,
      label: 'Review Backgrounds',
      description: 'Background-removed images from Bria.ai',
      stageKey: 'postBria'
    },
    {
      key: 'postPdf' as unknown as ReviewStage,
      label: 'Review Pages',
      description: 'Final compiled PDF ready for production',
      stageKey: 'postPdf'
    },
    {
      key: 'lulu' as unknown as ReviewStage,
      label: 'Print Status',
      description: 'Lulu print job status and tracking',
      stageKey: 'lulu'
    }
  ];

  // Early return if order is not loaded yet
  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">Loading order...</p>
        </div>
      </div>
    );
  }

  const activeStageKey = activeStage as unknown as keyof typeof order.reviewStages;
  const lifecycleStatus = getDisplayStatusForOrder(order);
  const activeStageDefinition = stages.find(
    (stage) => stage.key === activeStage
  );
  const activeStageDisplayStatus = getStageBadgeStatus(
    order.reviewStages[activeStageKey]?.status,
    activeStageDefinition?.stageKey
  );
  const latestCorrection = order.latestCustomerCorrection || null;
  const correctionSubmittedAt =
    latestCorrection?.submittedAt && latestCorrection.submittedAt.length > 0
      ? formatDate(latestCorrection.submittedAt)
      : null;

  const handleStageApprove = async (stage: ReviewStage, explicitStatus?: 'approved' | 'pending') => {
    if (!order) return;

    try {
      const stageKey = stage as unknown as keyof typeof order.reviewStages;
      const currentStatus = order.reviewStages[stageKey]?.status || 'pending';
      const nextStatus = explicitStatus || (currentStatus === 'approved' ? 'pending' : 'approved');

      // Check for flags before approving (client-side validation)
      if (nextStatus === 'approved') {
        const stageFlagCount = flagCounts[stageKey as 'preBria' | 'postBria' | 'postPdf'] || 0;
        if (stageFlagCount > 0) {
          alert(`Cannot approve stage: ${stageFlagCount} flagged item${stageFlagCount !== 1 ? 's' : ''} must be resolved first.`);
          return;
        }
      }

      const response = await fetch(`/api/orders/${order.orderId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage, status: nextStatus }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Failed to update stage' };
        }
        console.error('[handleStageApprove] API error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        // Handle both error formats: { error: string } or { error: { type, message } }
        let errorMessage = 'Failed to update stage';
        if (typeof errorData?.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        }
        
        throw new Error(errorMessage || `Failed to update stage (${response.status})`);
      }

      const result = await response.json();
      // Update the order with the approval result immediately (no delay, no refetch)
      if (result?.reviewStages || result?.flags) {
      setOrder(prev => {
        if (!prev) return prev;
          
          // Create new object references to ensure React detects changes
          const updatedReviewStages = result.reviewStages
            ? {
                ...prev.reviewStages,
                ...result.reviewStages,
              }
            : prev.reviewStages;
          
          const updatedOrder: Order = {
          ...prev,
            reviewStages: updatedReviewStages,
            ...(result.flags && { flags: result.flags }),
          };
          
          // Sync flagCounts state with order.flags for immediate UI update
          if (result.flags) {
            const newFlagCounts = {
              preBria: result.flags.preBria || 0,
              postBria: result.flags.postBria || 0,
              postPdf: result.flags.postPdf || 0,
            };
            setFlagCounts(newFlagCounts);
          }
          
          return updatedOrder;
      });
      }

    } catch (error) {
      console.error('Error approving stage:', error);
      // You could add a toast notification here to show the error
      alert((error as Error)?.message || 'Failed to update stage. Please try again.');
    }
  };

  const handleManualSendToPrint = async () => {
    if (!order) return;
    
    // Prevent duplicate requests
    if (printRequestInProgressRef.current) {
      console.warn('[SendToPrint] Request already in progress, ignoring duplicate call');
      return;
    }

    const confirmed = window.confirm(
      'Send this order to print now? This will start production and further changes may not be possible.'
    );
    if (!confirmed) {
      return;
    }

    try {
      printRequestInProgressRef.current = true;
      setManualPrintLoading(true);
      await handleSendToPrint('manual-admin');
      alert('Book Successfully Sent to Print Service');
    } catch (error: any) {
      console.error('Error sending order to print:', error);
      alert(error?.message || 'Failed to send order to print. Please try again.');
    } finally {
      setManualPrintLoading(false);
      // Reset after a short delay to prevent rapid re-clicks
      setTimeout(() => {
        printRequestInProgressRef.current = false;
      }, 1000);
    }
  };


  const handleInitiateWorkflow = async (stage: ReviewStage) => {
    if (!order) return;
    
    
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

        await response.json();
        
        // Refresh order data to update status (workflow step will change)
        await handleRefreshOrder();
        
        // Show success message (you could add a toast notification here)
        alert('Background removal workflow triggered successfully!');
      } catch (error: any) {
        console.error('Error triggering background removal workflow:', error);
        alert(`Failed to trigger background removal: ${error?.message || error}`);
      }

      return;
    }

    // Trigger book assembly for postBria stage
    if (stage === ('postBria' as unknown as ReviewStage)) {
      try {
        const response = await fetch(`/api/orders/${order.orderId}/trigger-book-assembly`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || 'Failed to trigger book assembly workflow');
        }

        await response.json();
        
        // Refresh order data to update status (workflow step will change)
        await handleRefreshOrder();
        
        // Show success message (you could add a toast notification here)
        alert('Book assembly workflow triggered successfully!');
      } catch (error: any) {
        console.error('Error triggering book assembly workflow:', error);
        alert(`Failed to trigger book assembly: ${error?.message || error}`);
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

  const handleCreateManifest = async () => {
    if (!order) return;
    
    if (!confirm('Create 1-manifest.json from order data? This will upload the manifest to R2 and reset the order to ready_for_processing.')) {
      return;
    }

    setCreatingManifest(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderId}/create-manifest`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create manifest');
      }

      alert('Manifest created successfully! Order has been reset to ready_for_processing.');
      await fetchOrder(order.orderId);
    } catch (error: any) {
      console.error('Error creating manifest:', error);
      alert(error?.message || 'Failed to create manifest. Please try again.');
    } finally {
      setCreatingManifest(false);
    }
  };

  const handleCreate2aManifest = async () => {
    if (!order) return;
    
    if (!confirm('Create 2A-manifest.json by reusing images from another order with the same character? This will use the generated poses from the source order but keep this order\'s customer information and dedication from the 1-manifest.')) {
      return;
    }

    setCreating2aManifest(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderId}/create-2a-manifest`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create 2A manifest');
      }

      alert(`2A manifest created successfully! Images reused from order ${data.sourceOrderId}. Order can now proceed to workflow 2B.`);
      await fetchOrder(order.orderId);
    } catch (error: any) {
      console.error('Error creating 2A manifest:', error);
      alert(error?.message || 'Failed to create 2A manifest. Please try again.');
    } finally {
      setCreating2aManifest(false);
    }
  };

  const handleCreate2bManifest = async () => {
    if (!order) return;
    
    if (!confirm('Create 2B-manifest.json by reusing images from another order with the same character? This will allow the order to proceed to workflow 3 without regenerating background-removed images.')) {
      return;
    }

    setCreating2bManifest(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderId}/create-2b-manifest`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create 2B manifest');
      }

      alert(`2B manifest created successfully! Images reused from order ${data.sourceOrderId}. Order can now proceed to workflow 3.`);
      await fetchOrder(order.orderId);
    } catch (error: any) {
      console.error('Error creating 2B manifest:', error);
      alert(error?.message || 'Failed to create 2B manifest. Please try again.');
    } finally {
      setCreating2bManifest(false);
    }
  };

  const handleNormalizeShipping = async () => {
    if (!order) return;
    
    if (!confirm('Normalize shipping address field names? This will add the expected field names (address_line_1, postal_code, state_code) and clear the missing_shipping error.')) {
      return;
    }
    
    setNormalizingShipping(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderId}/normalize-shipping`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to normalize shipping address');
      }
      
      alert('Shipping address normalized successfully! Refreshing order data...');
      await fetchOrder(order.orderId);
    } catch (error: any) {
      console.error('[Normalize Shipping] Error:', error);
      alert(`Failed to normalize shipping address: ${error.message}`);
    } finally {
      setNormalizingShipping(false);
    }
  };

  const handleResetOrderRecovery = async () => {
    if (!order) {
      return;
    }
    
    const nextWorkflow = order.nextWorkflow || '2A';
    if (!confirm(`Reset order to ready for processing?\n\nThis will:\n- Set execution_status to 'ready_for_processing'\n- Set next_workflow to '${nextWorkflow}'\n- Clear error fields and processing state\n- Queue order for router cron\n\nOrder will be picked up by the router cron and sent to workflow ${nextWorkflow}.`)) {
      return;
    }

    setResettingOrder(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderId}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        throw new Error('Invalid response from server');
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.details || `Server returned ${response.status}: ${response.statusText}`);
      }

      alert(`Order reset successfully!\n\nExecution Status: ${data.execution_status}\nNext Workflow: ${data.nextWorkflow}\n\nThe order is now ready for the router cron to pick up.`);
      
      // Refresh the order data
      await fetchOrder(order.orderId);
    } catch (error: any) {
      console.error('[Reset Button] Error resetting order:', error);
      alert(`Failed to reset order: ${error?.message || 'Unknown error'}\n\nCheck browser console for details.`);
    } finally {
      setResettingOrder(false);
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
                {order.customer.firstName} {order.customer.lastName} •{' '}
                {order.platform ? order.platform.charAt(0).toUpperCase() + order.platform.slice(1) : 'Amazon'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {/* Show total flagged count across all stages */}
              {order.reviewStages && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-700">
                  <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-500">
                    Total Flags
                  </span>
                  <FlaggedBadge count={(flagCounts.preBria || 0) + (flagCounts.postBria || 0) + (flagCounts.postPdf || 0)} />
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-700">
                <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-500">
                  Order Status
                </span>
                <DualStatusBadge
                  workflowStatus={lifecycleStatus.workflowStatus}
                  technicalStatus={lifecycleStatus.technicalStatus}
                  revisionCount={order?.revisionCount}
                  errors={lifecycleStatus.errors}
                />
              </span>
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
              <button
                type="button"
                onClick={handleManualSendToPrint}
                disabled={manualPrintLoading}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {manualPrintLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    Send to Print
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Manual Review Alert */}
        {order && (
          <ManualReviewAlert
            executionStatus={order.executionStatus || ''}
            errorMessage={order.errorMessage}
            errorType={order.errorType}
            retryCount={order.retryCount}
            workflowStep={order.workflowStep}
            currentWorkflow={undefined} // TODO: Add currentWorkflow to Order type if needed
          />
        )}

        {/* Recovery Actions Section - Only show if there are actual recovery actions available */}
        {order && (() => {
          // Check which buttons would actually be visible
          const canShowCreate1Manifest = !order.oneManifestUrl;
          
          const canShowCreate2aManifest = order.oneManifestUrl && 
                                          !order.manifest2aUrl && 
                                          order.characterHash && 
                                          order.r2Assets?.sharedImageInfo?.hasSource2aManifest;
          
          const canShowCreate2bManifest = (order.manifest2aUrl || (order.oneManifestUrl && order.r2Assets?.sharedImageInfo?.hasSource2aManifest)) && 
                                          !order.manifest2bUrl && 
                                          order.characterHash && 
                                          order.r2Assets?.sharedImageInfo?.hasSource2bManifest;
          
          const canShowResetButton = enableResetButton && (
            order.executionStatus === 'error' || 
            order.executionStatus === 'error_requires_manual_review' ||
            (order.executionStatus === 'processing' && order.currentWorkflow)
          );
          
          const canShowNormalizeShipping = order.error_type === 'missing_shipping' && 
                                          order.shipping_address && 
                                          typeof order.shipping_address === 'object';
          
          // Only show section if at least one button would be visible
          const hasAnyRecoveryAction = canShowCreate1Manifest || 
                                      canShowCreate2aManifest || 
                                      canShowCreate2bManifest || 
                                      canShowResetButton ||
                                      canShowNormalizeShipping;
          
          return hasAnyRecoveryAction;
        })() && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
            <h3 className="text-sm font-semibold text-yellow-900 mb-3">Recovery Actions</h3>
            <div className="flex flex-wrap gap-2">
              {!order.oneManifestUrl && (
                <button
                  type="button"
                  onClick={handleCreateManifest}
                  disabled={creatingManifest}
                  className="inline-flex items-center px-3 py-1.5 border border-yellow-300 rounded-md text-sm font-medium text-yellow-800 bg-white hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingManifest ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create 1-Manifest
                    </>
                  )}
                </button>
              )}
              {/* Show 2A button if: has 1-manifest, has characterHash, no 2A manifest, and source order with 2A manifest exists */}
              {order.oneManifestUrl && 
                               !order.manifest2aUrl && 
                               order.characterHash && 
                               order.r2Assets?.sharedImageInfo?.hasSource2aManifest && (
                <button
                  type="button"
                  onClick={handleCreate2aManifest}
                  disabled={creating2aManifest}
                  className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-md text-sm font-medium text-blue-800 bg-white hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Create 2A manifest by reusing images from another order with the same character. This will use the generated poses from the source order but keep this order's customer information and dedication from the 1-manifest."
                >
                  {creating2aManifest ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating 2A...
                    </>
                  ) : (
                    <>
                      Create 2A Manifest (Reuse Images)
                    </>
                  )}
                </button>
              )}
              {/* Show 2B button if: has 2A manifest (or 1-manifest if source 2A exists), has characterHash, no 2B manifest, and source order with 2B manifest exists */}
              {(() => {
                const has2aOrCanCreate2a = order.manifest2aUrl || (order.oneManifestUrl && order.r2Assets?.sharedImageInfo?.hasSource2aManifest);
                return has2aOrCanCreate2a && 
                               !order.manifest2bUrl && 
                               order.characterHash && 
                               order.r2Assets?.sharedImageInfo?.hasSource2bManifest;
              })() && (
                <button
                  type="button"
                  onClick={handleCreate2bManifest}
                  disabled={creating2bManifest}
                  className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-md text-sm font-medium text-blue-800 bg-white hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Create 2B manifest by reusing images from another order with the same character. This will allow the order to proceed to workflow 3 without regenerating background-removed images."
                >
                  {creating2bManifest ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating 2B...
                    </>
                  ) : (
                    <>
                      Create 2B Manifest (Reuse Images)
                    </>
                  )}
                </button>
              )}
              {(() => {
                const shouldShow = enableResetButton && (
                  order.executionStatus === 'error' || 
                  order.executionStatus === 'error_requires_manual_review' ||
                  (order.executionStatus === 'processing' && order.currentWorkflow)
                );
                return shouldShow;
              })() && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleResetOrderRecovery();
                  }}
                  disabled={resettingOrder}
                  className="inline-flex items-center px-3 py-1.5 border border-yellow-300 rounded-md text-sm font-medium text-yellow-800 bg-white hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  title={order.executionStatus === 'processing' 
                    ? 'Reset order stuck in processing state' 
                    : 'Reset order to ready for processing'}
                >
                  {resettingOrder ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      Reset Order
                    </>
                  )}
                </button>
              )}
              {order.error_type === 'missing_shipping' && 
               order.shipping_address && 
               typeof order.shipping_address === 'object' && (
                <button
                  type="button"
                  onClick={handleNormalizeShipping}
                  disabled={normalizingShipping}
                  className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-md text-sm font-medium text-blue-800 bg-white hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Fix shipping address field names to match n8n workflow validation requirements"
                >
                  {normalizingShipping ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Normalizing...
                    </>
                  ) : (
                    <>
                      Fix Shipping Address Fields
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Order Information Banner */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          {/* Status & Progress Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Order Status</h2>
            </div>
            {latestCorrection && (
              <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-orange-900">
                      Correction Requested: {formatReasonLabel(latestCorrection.reason)}
                    </p>
                    <p className="text-xs text-orange-800 mt-1">
                      {correctionSubmittedAt ? correctionSubmittedAt : 'Awaiting admin review'}
                    </p>
                    {(latestCorrection.name || latestCorrection.email) && (
                      <p className="text-xs text-orange-700 mt-1">
                        {latestCorrection.name && <span>{latestCorrection.name}</span>}
                        {latestCorrection.name && latestCorrection.email && (
                          <span className="mx-1">•</span>
                        )}
                        {latestCorrection.email && <span>{latestCorrection.email}</span>}
                      </p>
                    )}
                  </div>
                  {(latestCorrection.revisionCount ?? null) !== null &&
                    (latestCorrection.revisionCount ?? 0) > 1 && (
                    <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-2 py-0.5 text-xs font-semibold text-orange-700">
                      Revision {latestCorrection.revisionCount}
                    </span>
                  )}
                </div>
                {latestCorrection.message && (
                  <p className="mt-3 text-sm text-orange-900 whitespace-pre-wrap">
                    {latestCorrection.message}
                  </p>
                )}
                {latestCorrection.payload &&
                  Object.keys(latestCorrection.payload).length > 0 && (
                    <div className="mt-3 text-xs text-orange-900">
                      {!latestCorrection.message && (
                        <p className="text-sm text-orange-900 font-semibold mb-2">
                          Requested Updates
                        </p>
                      )}
                      <dl className="space-y-1">
                        {Object.entries(latestCorrection.payload).map(([key, value]) => (
                          <div key={key} className="flex flex-wrap gap-1">
                            <dt className="font-semibold">{formatFieldLabel(key)}:</dt>
                            <dd>{formatCorrectionValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
              </div>
            )}
            
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

            {/* Force Regeneration Section */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-yellow-900 mb-3">Force Regeneration</h3>
              <p className="text-xs text-yellow-800 mb-3">
                Clear workflow status fields and trigger regeneration. This will recreate assets even if they already exist.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    if (!confirm('This will clear 2A assets and regenerate. Continue?')) return;
                    try {
                      const res = await fetch(`/api/admin/orders/${order.orderId}/regenerate-2a`, { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to regenerate 2A');
                      alert('2A regeneration queued successfully');
                      // Refresh order data
                      window.location.reload();
                    } catch (error: any) {
                      alert(`Error: ${error.message}`);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  Regenerate 2A
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('This will clear 2B assets and regenerate. Continue?')) return;
                    try {
                      const res = await fetch(`/api/admin/orders/${order.orderId}/regenerate-2b`, { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to regenerate 2B');
                      alert('2B regeneration queued successfully');
                      // Refresh order data
                      window.location.reload();
                    } catch (error: any) {
                      alert(`Error: ${error.message}`);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  Regenerate 2B
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('This will clear 3 (Book Assembly) assets and regenerate. Continue?')) return;
                    try {
                      const res = await fetch(`/api/admin/orders/${order.orderId}/regenerate-3`, { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to regenerate 3');
                      alert('3 regeneration queued successfully');
                      // Refresh order data
                      window.location.reload();
                    } catch (error: any) {
                      alert(`Error: ${error.message}`);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  Regenerate 3
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('This will clear 4 (Print Fulfillment) status and regenerate. Continue?')) return;
                    try {
                      const res = await fetch(`/api/admin/orders/${order.orderId}/regenerate-4`, { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to regenerate 4');
                      alert('4 regeneration queued successfully');
                      // Refresh order data
                      window.location.reload();
                    } catch (error: any) {
                      alert(`Error: ${error.message}`);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  Regenerate 4
                </button>
              </div>
            </div>
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
                  <p className="text-sm text-gray-600">
                    {order.characterSpecs?.childName
                      ? `${order.characterSpecs.childName}'s Inner Voice`
                      : 'N/A'}
                  </p>
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
                {stages.map((stage) => {
                  // Only show Lulu tab if order has been submitted to Lulu
                  if (stage.stageKey === 'lulu' && !order.luluJobId) {
                    return null;
                  }
                  
                  return (
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
                        {(() => {
                          // Lulu stage shows status badge instead of approval badge
                          if (stage.stageKey === 'lulu') {
                            if (order.luluStatus) {
                              const statusColors: Record<string, string> = {
                                CREATED: 'bg-blue-100 text-blue-800 border-blue-200',
                                UNPAID: 'bg-blue-100 text-blue-800 border-blue-200',
                                PAYMENT_IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
                                PRODUCTION_DELAYED: 'bg-blue-100 text-blue-800 border-blue-200',
                                PRODUCTION_READY: 'bg-blue-100 text-blue-800 border-blue-200',
                                IN_PRODUCTION: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                                SHIPPED: 'bg-green-100 text-green-800 border-green-200',
                                DELIVERED: 'bg-green-100 text-green-800 border-green-200',
                                REJECTED: 'bg-red-100 text-red-800 border-red-200',
                                CANCELED: 'bg-gray-100 text-gray-800 border-gray-200',
                              };
                              const colors = statusColors[order.luluStatus] || 'bg-gray-100 text-gray-800 border-gray-200';
                              return (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
                                  {order.luluStatus}
                                </span>
                              );
                            }
                            return null;
                          }
                          
                          // Use stageKey to access reviewStages (more reliable than stage.key)
                          const stageStatus = order.reviewStages[stage.stageKey]?.status;
                        // Use stageKey (preBria/postBria/postPdf) to look up flag count, not stage.key
                        const stageFlagCount = flagCounts[stage.stageKey] || 0;
                        // Compare with string 'approved' to handle both enum and string values
                        const isApproved = stageStatus === ReviewStageStatus.APPROVED || stageStatus === 'approved';
                        const revisionCount = typeof order.revisionCount === 'number' ? order.revisionCount : 0;
                        const isSecondReview = revisionCount >= 1;
                        
                        // Debug logging for badge state
                        if (stage.stageKey === 'preBria' || stage.stageKey === 'postBria' || stage.stageKey === 'postPdf') {
                        }
                        
                        // Check if stage has been reached
                        // Pre-Bria: always reached if order exists
                        // Post-Bria: reached if preBria is approved
                        // Post-PDF: reached if postBria is approved
                        let hasBeenReached = false;
                        if (stage.stageKey === 'preBria') {
                          hasBeenReached = true; // First stage is always reachable
                        } else if (stage.stageKey === 'postBria') {
                          hasBeenReached = order.reviewStages.preBria?.status === ReviewStageStatus.APPROVED || order.reviewStages.preBria?.status === 'approved';
                        } else if (stage.stageKey === 'postPdf') {
                          hasBeenReached = order.reviewStages.postBria?.status === ReviewStageStatus.APPROVED || order.reviewStages.postBria?.status === 'approved';
                        }
                        
                        // Priority: Approved > Flags > Pending
                        if (isApproved) {
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">
                              Approved
                            </span>
                          );
                        } else if (stageFlagCount > 0) {
                          // Show flags if they exist, regardless of whether stage has been "reached"
                          // Flags indicate work that needs attention, so always show them
                          return <FlaggedBadge count={stageFlagCount} />;
                        } else if (hasBeenReached) {
                          // Stage reached but no flags - show Pending with appropriate color
                          // Use yellow colors if in second review, otherwise gray
                          const pendingColors = isSecondReview 
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200';
                          return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${pendingColors}`}>
                              Pending
                            </span>
                          );
                        } else {
                          // Stage not reached yet - show Pending
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-600 border-gray-200">
                              Pending
                        </span>
                          );
                        }
                      })()}
                    </div>
                  </button>
                  );
                })}
              </nav>
            </div>

            {/* Stage Content */}
            <div className="p-6">
              {activeStage === ('preBria' as unknown as ReviewStage) && (
                <PreBriaStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.preBria?.status === ReviewStageStatus.APPROVED || order.reviewStages.preBria?.status === 'approved'}
                  onApprove={async (status) => await handleStageApprove('preBria' as unknown as ReviewStage, status)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('preBria' as unknown as ReviewStage)}
                  onRefresh={handleRefreshOrder}
                  onOrderUpdate={handleOrderUpdate}
                />
              )}
              
              {activeStage === ('postBria' as unknown as ReviewStage) && (
                <PostBriaStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.postBria?.status === ReviewStageStatus.APPROVED || order.reviewStages.postBria?.status === 'approved'}
                  onApprove={async (status) => await handleStageApprove('postBria' as unknown as ReviewStage, status)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('postBria' as unknown as ReviewStage)}
                  onRefresh={handleRefreshOrder}
                  onOrderUpdate={handleOrderUpdate}
                />
              )}
              
              {activeStage === ('postPdf' as unknown as ReviewStage) && (
                <PostPdfStage
                  orderId={order.orderId}
                  order={order}
                  isApproved={order.reviewStages.postPdf?.status === ReviewStageStatus.APPROVED || order.reviewStages.postPdf?.status === 'approved'}
                  onApprove={async (status) => await handleStageApprove('postPdf' as unknown as ReviewStage, status)}
                  onInitiateWorkflow={() => handleInitiateWorkflow('postPdf' as unknown as ReviewStage)}
                  onRefresh={handleRefreshOrder}
                  finalApprovalResult={finalApprovalResult}
                  finalApprovalError={finalApprovalError}
                  finalApprovalLoading={finalApprovalLoading}
                  onSendToPrint={() => handleSendToPrint('post-pdf-stage')}
                />
              )}

              {activeStage === ('lulu' as unknown as ReviewStage) && (
                <LuluStage
                  orderId={order.orderId}
                  order={order}
                  onRefresh={handleRefreshOrder}
                  onRefreshStatus={handleRefreshLuluStatus}
                  onCancelOrder={handleCancelLuluOrder}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
