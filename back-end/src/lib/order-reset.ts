import { ReviewStageStatus, OrderStatus } from '@/constants/statuses';
import {
  getOrderFromSupabase,
  supabase,
  createOrderInSupabase,
} from './supabase-client';
import { updateOrderStatus } from './status-service';
import {
  mapSupabaseOrderToOrder,
  mapManifestToOrder,
} from './order-mapper';
import { buildManifestKey, downloadManifest } from './r2-service';

const DEFAULT_REVIEW_STAGES = {
  preBria: {
    status: ReviewStageStatus.PENDING,
  },
  postBria: {
    status: ReviewStageStatus.PENDING,
  },
  postPdf: {
    status: ReviewStageStatus.PENDING,
  },
};

const DEFAULT_FLAGS = {
  preBria: 0,
  postBria: 0,
  postPdf: 0,
  total: 0,
};

export class OrderResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderResetError';
  }
}

export async function resetOrderToInitialState(orderId: string) {
  let existingOrder: any = null;

  try {
    existingOrder = await getOrderFromSupabase(orderId);
  } catch (lookupError) {
    console.warn('[OrderReset] Supabase lookup failed', {
      orderId,
      error: lookupError,
    });
  }

  if (!existingOrder) {
    existingOrder = await hydrateOrderFromManifest(orderId);
  }

  if (!existingOrder) {
    throw new OrderResetError('ORDER_NOT_FOUND');
  }

  // Clear preview tokens so a fresh token can be generated
  try {
    const { error: deleteTokensError } = await supabase
      .from('preview_tokens')
      .delete()
      .eq('order_id', orderId)
      .select();

    if (deleteTokensError) {
      console.warn('[OrderReset] Failed to delete preview tokens', {
        orderId,
        error: deleteTokensError,
      });
    }
  } catch (error) {
    console.warn('[OrderReset] Unexpected error deleting preview tokens', {
      orderId,
      error,
    });
  }

  // Clear customer contact history to allow new revisions
  try {
    const { error: deleteContactsError } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('order_id', orderId)
      .select();

    if (deleteContactsError) {
      console.warn('[OrderReset] Failed to delete customer contacts', {
        orderId,
        error: deleteContactsError,
      });
    }
  } catch (error) {
    console.warn('[OrderReset] Unexpected error deleting customer contacts', {
      orderId,
      error,
    });
  }

  // Clear customer feedback/revision history
  try {
    const { error: deleteFeedbackError } = await supabase
      .from('customer_feedback')
      .delete()
      .eq('order_id', orderId)
      .select();

    if (deleteFeedbackError) {
      console.warn('[OrderReset] Failed to delete customer feedback', {
        orderId,
        error: deleteFeedbackError,
      });
    }
  } catch (error) {
    console.warn('[OrderReset] Unexpected error deleting customer feedback', {
      orderId,
      error,
    });
  }

  await updateOrderStatus(orderId, {
    review_stages: DEFAULT_REVIEW_STAGES,
    flags: DEFAULT_FLAGS,
    has_flags: false,
    workflow_step: null,
    customer_approval_status: null,
    customer_approval_required: false,
    customer_approval_requested_at: null,
    customer_approval_approved_at: null,
    revision_count: 0,
    status: OrderStatus.NEW,
  });

  const updatedOrder = await getOrderFromSupabase(orderId);

  if (!updatedOrder) {
    throw new OrderResetError('ORDER_NOT_FOUND_AFTER_RESET');
  }

  return mapSupabaseOrderToOrder(updatedOrder);
}

async function hydrateOrderFromManifest(orderId: string) {
  const stages: Array<'3' | '2b' | '2a'> = ['3', '2b', '2a'];

  for (const stage of stages) {
    try {
      const manifestKey = buildManifestKey(orderId, stage);
      const manifest = await downloadManifest(manifestKey);

      if (!manifest) {
        continue;
      }

      const manifestOrder = mapManifestToOrder(orderId, manifest);
      const customerName = [manifestOrder.customer.firstName, manifestOrder.customer.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

      await createOrderInSupabase({
        orderId: manifestOrder.orderId ?? orderId,
        amazonOrderId: manifestOrder.amazonOrderId ?? orderId,
        project: manifestOrder.project,
        platform: manifestOrder.platform,
        customerEmail: manifestOrder.customerEmail,
        customerName: customerName || manifestOrder.customerEmail || 'Customer Pending',
        characterHash: manifestOrder.characterHash,
        characterSpecs: manifestOrder.characterSpecs,
        bookSpecs: manifestOrder.bookSpecs,
        orderDetails: manifestOrder.orderDetails,
        assetPrefix: manifestOrder.assetPrefix,
        templatePath: manifestOrder.templatePath,
        reviewStages: DEFAULT_REVIEW_STAGES,
        flags: DEFAULT_FLAGS,
        hasFlags: false,
        revisionCount: 0,
        status: OrderStatus.NEW,
      });

      return await getOrderFromSupabase(orderId);
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      const isMissingManifest =
        error?.status === 404 ||
        message.includes('no such key') ||
        message.includes('not found');

      if (isMissingManifest) {
        continue;
      }

      console.warn(
        `[OrderReset] Failed to hydrate order ${orderId} from ${stage}-manifest`,
        error
      );
    }
  }

  return null;
}


