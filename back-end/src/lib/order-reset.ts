import { ReviewStageStatus, OrderStatus } from '@/constants/statuses';
import { getOrderFromSupabase, supabase } from './supabase-client';
import { updateOrderStatus } from './status-service';
import { mapSupabaseOrderToOrder } from './order-mapper';

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
  const existingOrder = await getOrderFromSupabase(orderId);

  if (!existingOrder) {
    throw new OrderResetError('ORDER_NOT_FOUND');
  }

  // Clear preview tokens so a fresh token can be generated
  try {
    const { error: deleteTokensError } = await supabase
      .from('preview_tokens')
      .delete()
      .eq('order_id', orderId);

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
      .eq('order_id', orderId);

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


