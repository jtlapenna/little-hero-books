import { ReviewStageStatus } from '@/constants/statuses';
import { Order, ReviewStage } from '@/types/order';
import { calculateOrderStatus } from './status-service';

type SupabaseOrderRecord = Record<string, any>;

interface MapOptions {
  /**
   * When false, uses the raw status from the Supabase record instead of calling calculateOrderStatus.
   * Useful if the caller already computed the status.
   */
  includeStatus?: boolean;
}

export async function mapSupabaseOrderToOrder(
  record: SupabaseOrderRecord,
  options: MapOptions = {}
): Promise<Order> {
  if (!record) {
    throw new Error('Missing Supabase order record');
  }

  const orderId =
    record.amazon_order_id ||
    record.orderId ||
    record.order_id ||
    (record.id ? String(record.id) : null);

  if (!orderId) {
    throw new Error('Supabase order record is missing a valid identifier');
  }

  const status =
    options.includeStatus === false && typeof record.status === 'string'
      ? record.status
      : await calculateOrderStatus(orderId);

  const characterSpecs = record.character_specs || {};
  const bookSpecs = record.book_specs || {};
  const orderDetailsRaw = record.order_details || {};

  const defaultProject = record.project || 'book-mvp-simple-adventure';
  const defaultTemplatePath = record.template_path || 'templates';

  const childName =
    characterSpecs.childName ||
    characterSpecs.child_name ||
    extractChildNameFromCustomer(record.customer_name);

  const { firstName, lastName } = splitName(
    record.customer_name,
    childName || 'Customer Unknown'
  );

  const customerEmail =
    record.customer_email ||
    record.customer?.email ||
    characterSpecs.contactEmail ||
    undefined;

  const reviewStages = buildReviewStages(record.review_stages);

  const orderDetails = {
    quantity: orderDetailsRaw.quantity ?? 1,
    pages: orderDetailsRaw.pages ?? bookSpecs.totalPages ?? 16,
    format: orderDetailsRaw.format ?? bookSpecs.format ?? '8.5x8.5_softcover',
    shippingAddress:
      orderDetailsRaw.shippingAddress ||
      orderDetailsRaw.shipping_address ||
      record.shipping_address ||
      {},
    ...orderDetailsRaw,
  };

  const order: Order = {
    orderId,
    platform: record.platform || 'amazon',
    amazonOrderId: record.amazon_order_id || undefined,
    project: defaultProject,
    customer: {
      firstName,
      lastName,
      email: customerEmail || 'customer@example.com',
    },
    customerEmail,
    orderDate:
      toIsoString(record.purchase_date) ||
      toIsoString(record.order_date) ||
      toIsoString(record.created_at) ||
      new Date().toISOString(),
    status,
    aiGenerationStartedAt: toIsoString(record.ai_generation_started_at),
    aiGenerationCompletedAt: toIsoString(record.ai_generation_completed_at),
    characterHash: record.character_hash || characterSpecs.characterHash,
    characterPath: record.character_path || undefined,
    templatePath: defaultTemplatePath,
    characterSpecs,
    bookSpecs,
    orderDetails,
    assetPrefix:
      record.asset_prefix || `book-mvp-simple-adventure/orders/${orderId}/`,
    reviewStages,
    customerApprovalStatus: record.customer_approval_status || undefined,
    customerApprovalRequestedAt: toIsoString(
      record.customer_approval_requested_at
    ),
    customerApprovalApprovedAt: toIsoString(
      record.customer_approval_approved_at
    ),
    revisionCount:
      typeof record.revision_count === 'number' ? record.revision_count : 0,
    hasFlags: record.has_flags ?? false,
    flags: record.flags || undefined,
    finalBookUrl: record.final_book_url || undefined,
    finalCoverUrl: record.final_cover_url || undefined,
    workflowStep: record.workflow_step || undefined,
    luluStatus: record.lulu_status || undefined,
    createdAt: toIsoString(record.created_at),
    updatedAt: toIsoString(record.updated_at),
    webhooks: {
      onApprove:
        record.webhook_url ||
        record.webhooks?.onApprove ||
        'https://n8n.example.com/webhook/approve',
    },
  };

  // Derive character path if missing but hash exists
  if (!order.characterPath && order.characterHash) {
    order.characterPath = `characters/${order.characterHash}`;
  }

  return order;
}

function buildReviewStages(data: any): Order['reviewStages'] {
  const preBria = normalizeReviewStage(data?.preBria ?? data?.pre_bria);
  const postBria = normalizeReviewStage(data?.postBria ?? data?.post_bria);
  const postPdf = normalizeReviewStage(data?.postPdf ?? data?.post_pdf);

  return {
    preBria,
    postBria,
    postPdf,
  };
}

function normalizeReviewStage(stageData: any): ReviewStage {
  if (!stageData || typeof stageData !== 'object') {
    return { status: ReviewStageStatus.PENDING };
  }

  const rawStatus =
    stageData.status ||
    stageData.Status ||
    stageData.reviewStatus ||
    stageData.review_status ||
    'pending';

  const normalized =
    typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'pending';

  let status: ReviewStage['status'];
  switch (normalized) {
    case 'approved':
      status = ReviewStageStatus.APPROVED;
      break;
    case 'in-review':
    case 'in_review':
      status = ReviewStageStatus.IN_REVIEW;
      break;
    case 'rejected':
      status = ReviewStageStatus.REJECTED;
      break;
    case 'pending':
    default:
      status = ReviewStageStatus.PENDING;
      break;
  }

  return {
    status,
    reviewedAt:
      stageData.reviewedAt ||
      stageData.reviewed_at ||
      stageData.updated_at ||
      undefined,
    reviewer: stageData.reviewer || stageData.reviewed_by || undefined,
    comments: stageData.comments || stageData.notes || undefined,
  };
}

function splitName(fullName?: string, fallback?: string) {
  const safeName = fullName?.trim() || fallback?.trim() || '';

  if (!safeName.length) {
    return { firstName: 'Customer', lastName: 'Pending' };
  }

  const parts = safeName.split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function extractChildNameFromCustomer(customerName?: string | null) {
  if (!customerName) return undefined;
  const name = String(customerName).trim();
  return name.length ? name : undefined;
}

function toIsoString(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

