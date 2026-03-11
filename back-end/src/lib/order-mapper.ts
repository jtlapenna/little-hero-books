import { OrderStatus, ReviewStageStatus } from '@/constants/statuses';
import { Order, ReviewStage } from '@/types/order';
import { calculateOrderStatus } from './status-service';
import { downloadManifest, buildManifestKey } from './r2-service';

type SupabaseOrderRecord = Record<string, any>;

interface MapOptions {
  /**
   * When false, uses the raw status from the Supabase record instead of calling calculateOrderStatus.
   * Useful if the caller already computed the status.
   */
  includeStatus?: boolean;
}

export function parseSiblingItemNumber(orderId: string): number | undefined {
  const match = /-item-(\d+)$/.exec(orderId);
  if (!match) return undefined;

  const itemNumber = Number.parseInt(match[1], 10);
  return Number.isFinite(itemNumber) ? itemNumber : undefined;
}

export async function mapSupabaseOrderToOrder(
  record: SupabaseOrderRecord,
  options: MapOptions = {}
): Promise<Order> {
  if (!record) {
    throw new Error('Missing Supabase order record');
  }

  const orderId =
    record.orderId ||
    record.order_id ||
    record.amazon_order_id ||
    (record.id ? String(record.id) : null);

  if (!orderId) {
    throw new Error('Supabase order record is missing a valid identifier');
  }

  const rootOrderId =
    typeof record.root_order_id === 'string' && record.root_order_id.trim().length > 0
      ? record.root_order_id.trim()
      : undefined;
  const isSibling = !!(rootOrderId && rootOrderId !== orderId);
  const itemNumber = parseSiblingItemNumber(orderId);

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
    displayOrderId: record.display_order_id || undefined,
    platform: record.platform || 'amazon',
    amazonOrderId: record.amazon_order_id || undefined,
    rootOrderId,
    isSibling,
    itemNumber,
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
    reprintCount:
      typeof record.reprint_count === 'number' ? record.reprint_count : 0,
    reprintReason: typeof record.reprint_reason === 'string' ? record.reprint_reason : undefined,
    reprintNote: typeof record.reprint_note === 'string' ? record.reprint_note : undefined,
    hasFlags: record.has_flags ?? false,
    flags: record.flags || undefined,
    finalBookUrl: record.final_book_url || undefined,
    finalCoverUrl: record.final_cover_url || undefined,
    workflowStep: record.workflow_step || undefined,
    currentWorkflow: record.current_workflow || undefined,
    luluStatus: record.lulu_status || undefined,
    luluJobId: record.lulu_job_id || undefined,
    executionStatus: record.execution_status || undefined,
    errorMessage: record.error_message || undefined,
    errorType: record.error_type || undefined,
    retryCount: typeof record.retry_count === 'number' ? record.retry_count : undefined,
    oneManifestUrl: record.one_manifest_url || undefined,
    manifest2aUrl: record.manifest_2a_url || undefined,
    manifest2bUrl: record.manifest_2b_url || undefined,
    manifest3Url: record.manifest_3_url || undefined,
    startedAt: toIsoString(record.started_at),
    queuedAt: toIsoString(record.queued_at),
    createdAt: toIsoString(record.created_at),
    updatedAt: toIsoString(record.updated_at),
    lastSkipReason: record.last_skip_reason || undefined,
    lastSkipAt: toIsoString(record.last_skip_at),
    lastSkipDetails: record.last_skip_details && typeof record.last_skip_details === 'object' 
      ? record.last_skip_details as { totalApproved: number; skippedByBriaStatus: number; skippedBy2BManifest: number; skippedTotal: number }
      : undefined,
    // Lifecycle status for archiving system
    lifecycle_status: record.lifecycle_status || 'active',
    assumed_delivered_at: toIsoString(record.assumed_delivered_at),
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

  // Fetch 4-manifest to get additional Lulu data (cost, estimated ship date, etc.)
  if (order.luluJobId) {
    try {
      const manifest4Key = buildManifestKey(orderId, '4');
      const manifest4 = await downloadManifest(manifest4Key).catch(() => null);
      
      if (manifest4?.lulu) {
        order.luluCost = manifest4.lulu.cost;
        order.luluEstimatedShipDate = manifest4.lulu.estimatedShipDate;
        // Set submitted date from manifest creation date
        if (manifest4.createdAt) {
          order.luluSubmittedAt = manifest4.createdAt;
        }
      }
      
      // Extract tracking info from Supabase if available (may be stored separately)
      // Check if there's tracking data in the record
      if (record.tracking_number) {
        order.luluTrackingNumber = record.tracking_number;
      }
      if (record.tracking_url) {
        order.luluTrackingUrl = record.tracking_url;
      }
      if (record.carrier) {
        order.luluCarrier = record.carrier;
      }
    } catch (error) {
      // Silently fail - 4-manifest may not exist yet
      console.log(`[Order Mapper] Could not fetch 4-manifest for ${orderId}:`, error);
    }
  }

  return order;
}

export function mapManifestToOrder(orderId: string, manifest: any): Order {
  const orderData = manifest?.order || {};
  const workflow = manifest?.workflow || {};
  const characterHash = manifest?.characterHash;

  let status = OrderStatus.QUEUED_FOR_PROCESSING;
  if (workflow.currentStage === '2A-complete') {
    status = OrderStatus.AI_GENERATION_IN_PROGRESS;
  } else if (workflow.currentStage === '2B-complete') {
    status = OrderStatus.PENDING_BG_REMOVAL_REVIEW;
  } else if (workflow.currentStage === '3-complete') {
    status = OrderStatus.PENDING_ASSEMBLY_REVIEW;
  }

  const manifestCharacterSpecs = {
    ...(orderData.characterSpecs || {}),
    childName:
      orderData.characterSpecs?.childName ||
      orderData.childName ||
      orderData.child_name,
    age:
      orderData.characterSpecs?.age ||
      orderData.age,
    skinTone:
      orderData.characterSpecs?.skinTone ||
      orderData.skinTone,
    hairColor:
      orderData.characterSpecs?.hairColor ||
      orderData.hairColor,
    hairStyle:
      orderData.characterSpecs?.hairStyle ||
      orderData.hairStyle,
    animalGuide:
      orderData.characterSpecs?.animalGuide ||
      orderData.animalGuide ||
      orderData.characterSpecs?.favoriteAnimal ||
      orderData.favoriteAnimal,
    clothingStyle:
      orderData.characterSpecs?.clothingStyle ||
      orderData.clothingStyle,
    favoriteColor:
      orderData.characterSpecs?.favoriteColor ||
      orderData.favoriteColor,
    favoriteFood:
      orderData.characterSpecs?.favoriteFood ||
      orderData.favoriteFood,
  };

  const childName =
    manifestCharacterSpecs.childName ||
    extractChildNameFromCustomer(orderData.customerName);

  const { firstName, lastName } = splitName(
    orderData.customerName,
    childName || 'Customer Unknown'
  );

  const bookSpecs = {
    ...(orderData.bookSpecs || {}),
    title:
      orderData.bookSpecs?.title ||
      orderData.bookTitle ||
      (childName ? `${childName} and the Adventure Compass` : undefined),
    totalPages:
      orderData.bookSpecs?.totalPages ||
      orderData.totalPages ||
      16,
    format:
      orderData.bookSpecs?.format ||
      orderData.format ||
      '8.5x8.5_softcover',
  };

  const reviewStages = {
    preBria: { status: ReviewStageStatus.PENDING },
    postBria: { status: ReviewStageStatus.PENDING },
    postPdf: { status: ReviewStageStatus.PENDING },
  };

  return {
    orderId: orderData.orderId || orderId,
    platform: 'amazon',
    amazonOrderId: orderData.amazonOrderId || orderId,
    project: orderData.project || 'book-mvp-simple-adventure',
    customer: {
      firstName,
      lastName,
      email: orderData.customerEmail || 'customer@example.com',
    },
    customerEmail: orderData.customerEmail || 'customer@example.com',
    orderDate:
      manifest?.generatedAt ||
      manifest?.runStamp ||
      new Date().toISOString(),
    status,
    aiGenerationStartedAt: manifest?.runStamp || manifest?.generatedAt,
    aiGenerationCompletedAt: undefined,
    characterHash: characterHash,
    characterPath: characterHash ? `characters/${characterHash}` : undefined,
    templatePath: 'templates',
    characterSpecs: manifestCharacterSpecs,
    bookSpecs,
    orderDetails: {
      quantity: orderData.quantity || 1,
      pages: bookSpecs.totalPages,
      format: bookSpecs.format,
      shippingAddress: orderData.shippingAddress || {},
      ...orderData.orderDetails,
    },
    assetPrefix: `book-mvp-simple-adventure/orders/${orderId}/`,
    reviewStages,
    customerApprovalStatus: undefined,
    customerApprovalRequestedAt: undefined,
    customerApprovalApprovedAt: undefined,
    revisionCount: 0,
    hasFlags: false,
    flags: undefined,
    finalBookUrl: undefined,
    finalCoverUrl: undefined,
    workflowStep: undefined,
    luluStatus: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    webhooks: {
      onApprove: orderData.webhookUrl || 'https://n8n.example.com/webhook/approve',
    },
  };
}

export function mergeOrderData(primary: Order, fallback: Order | null): Order {
  if (!fallback) {
    return { ...primary };
  }

  const merged: Order = { ...primary };

  merged.customer = {
    firstName: isUnknownName(primary.customer.firstName)
      ? fallback.customer.firstName
      : primary.customer.firstName,
    lastName: isUnknownName(primary.customer.lastName)
      ? fallback.customer.lastName
      : primary.customer.lastName,
    email: primary.customer.email || fallback.customer.email,
  };

  if (!merged.customerEmail && fallback.customerEmail) {
    merged.customerEmail = fallback.customerEmail;
  }

  if (!merged.characterHash && fallback.characterHash) {
    merged.characterHash = fallback.characterHash;
  }
  if (!merged.characterPath && fallback.characterPath) {
    merged.characterPath = fallback.characterPath;
  }
  if (!merged.templatePath && fallback.templatePath) {
    merged.templatePath = fallback.templatePath;
  }
  if (!merged.assetPrefix && fallback.assetPrefix) {
    merged.assetPrefix = fallback.assetPrefix;
  }

  if (
    !merged.characterSpecs ||
    Object.keys(merged.characterSpecs).length === 0
  ) {
    merged.characterSpecs = fallback.characterSpecs;
  }
  if (!merged.bookSpecs || Object.keys(merged.bookSpecs).length === 0) {
    merged.bookSpecs = fallback.bookSpecs;
  }

  merged.orderDetails = {
    ...fallback.orderDetails,
    ...merged.orderDetails,
  };

  // Always preserve reviewStages from primary (Supabase) - never overwrite with fallback (manifest)
  // Supabase is the source of truth for approval status
  // Always use primary.reviewStages if it exists, regardless of whether stages are pending or approved
  if (primary.reviewStages) {
    // Primary (Supabase) has reviewStages - ALWAYS use them, never overwrite with manifest
    // Only fill in missing individual stages from fallback if they don't exist in primary
    merged.reviewStages = {
      preBria: primary.reviewStages.preBria || fallback?.reviewStages?.preBria || { status: ReviewStageStatus.PENDING },
      postBria: primary.reviewStages.postBria || fallback?.reviewStages?.postBria || { status: ReviewStageStatus.PENDING },
      postPdf: primary.reviewStages.postPdf || fallback?.reviewStages?.postPdf || { status: ReviewStageStatus.PENDING },
    };
  } else {
    // Primary has no reviewStages - use fallback
    merged.reviewStages = fallback?.reviewStages || {
      preBria: { status: ReviewStageStatus.PENDING },
      postBria: { status: ReviewStageStatus.PENDING },
      postPdf: { status: ReviewStageStatus.PENDING },
    };
  }

  if (!merged.webhooks?.onApprove && fallback.webhooks?.onApprove) {
    merged.webhooks = { onApprove: fallback.webhooks.onApprove };
  }

  if (!merged.finalBookUrl && fallback.finalBookUrl) {
    merged.finalBookUrl = fallback.finalBookUrl;
  }
  if (!merged.finalCoverUrl && fallback.finalCoverUrl) {
    merged.finalCoverUrl = fallback.finalCoverUrl;
  }

  return merged;
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
    case 'needs_review':
    case 'needs-review':
      status = ReviewStageStatus.NEEDS_REVIEW;
      break;
    case 'in-review':
    case 'in_review':
      status = ReviewStageStatus.IN_REVIEW;
      break;
    case 'ready':
      // "ready" means the stage is ready for review but not yet reviewed/approved
      // Map it to NEEDS_REVIEW so it shows up in the review workflow
      status = ReviewStageStatus.NEEDS_REVIEW;
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

export function splitName(fullName?: string, fallback?: string) {
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
  const raw = String(value).trim();

  // Supabase/Postgres `timestamp` (without time zone) commonly returns strings like:
  // - "2026-01-28 13:37:00"
  // - "2026-01-28T13:37:00"
  // These are *timezone-less* and JS interprets them as local time, which can make
  // UTC values look "in the future" in the UI.
  //
  // We treat timezone-less timestamps as UTC by appending "Z".
  const hasExplicitTz = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const isDateTimeNoTz =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(raw) &&
    !hasExplicitTz;

  const normalized = isDateTimeNoTz ? raw.replace(' ', 'T') + 'Z' : raw;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function isUnknownName(name: string) {
  if (!name) return true;
  const normalized = name.toLowerCase();
  return (
    normalized === 'unknown' ||
    normalized === 'customer' ||
    normalized === 'customer pending'
  );
}
