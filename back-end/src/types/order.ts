export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
}

import { DisplayStatus, ReviewStageStatus } from '@/constants/statuses';
import { OrderPhase } from '@/constants/phases';

export interface ReviewStage {
  status: ReviewStageStatus | 'pending' | 'in-review' | 'approved' | 'rejected'; // Support both old and new values during transition
  reviewedAt?: string;
  reviewer?: string;
  comments?: string;
}

export interface Order {
  orderId: string;
  platform: string;
  amazonOrderId?: string;
  project: string;
  customer: Customer;
  customerEmail?: string;
  orderDate: string;
  status: string;
  aiGenerationStartedAt?: string;
  aiGenerationCompletedAt?: string;
  characterHash?: string;
  characterPath?: string;
  templatePath?: string;
  characterSpecs: Record<string, any>;
  bookSpecs: Record<string, any>;
  orderDetails: Record<string, any>;
  assetPrefix: string;
  reviewStages: {
    preBria: ReviewStage;
    postBria: ReviewStage;
    postPdf: ReviewStage;
  };
  customerApprovalStatus?: string;
  customerApprovalRequestedAt?: string;
  customerApprovalApprovedAt?: string;
  revisionCount?: number;
  hasFlags?: boolean;
  flags?: Record<string, any>;
  finalBookUrl?: string;
  finalCoverUrl?: string;
  workflowStep?: string;
  currentWorkflow?: string; // current_workflow from Supabase (2A, 2B, 3, etc.)
  luluStatus?: string;
  luluJobId?: string; // Lulu job ID from lulu_job_id
  luluCost?: number; // Print job cost
  luluEstimatedShipDate?: string; // Estimated ship date
  luluTrackingNumber?: string; // Tracking number (when shipped)
  luluTrackingUrl?: string; // Tracking URL (when shipped)
  luluCarrier?: string; // Shipping carrier (when shipped)
  luluSubmittedAt?: string; // When order was submitted to Lulu
  luluStatusHistory?: Array<{status: string, timestamp: string, details?: any}>; // Status change history
  executionStatus?: string; // execution_status from Supabase (processing, error, error_requires_manual_review, etc.)
  errorMessage?: string; // error_message from Supabase
  errorType?: string; // error_type from Supabase
  retryCount?: number; // retry_count from Supabase
  oneManifestUrl?: string; // one_manifest_url from Supabase
  manifest2aUrl?: string; // manifest_2a_url from Supabase
  manifest2bUrl?: string; // manifest_2b_url from Supabase
  manifest3Url?: string; // manifest_3_url from Supabase
  startedAt?: string; // started_at from Supabase
  queuedAt?: string; // queued_at from Supabase
  createdAt?: string;
  updatedAt?: string;
  customerPreview?: {
    token: string;
    url: string;
    requestedAt?: string;
    expiresAt?: string;
    usedAt?: string;
  };
  webhooks: {
    onApprove: string;
  };
  r2Assets?: {
    characterHash: string;
    baseCharacter: any;
    poses: any[];
    baseCharacterBgRemoved: any;
    posesBgRemoved: any[];
  };
  latestCustomerCorrection?: CustomerCorrection | null;
  lastSkipReason?: string; // last_skip_reason from Supabase
  lastSkipAt?: string; // last_skip_at from Supabase
  lastSkipDetails?: { // last_skip_details from Supabase
    totalApproved: number;
    skippedByBriaStatus: number;
    skippedBy2BManifest: number;
    skippedTotal: number;
  };
  lifecycle_status?: string; // Order lifecycle: 'active' | 'recently_delivered' | 'archived'
  assumed_delivered_at?: string; // When order was assumed delivered (shipped_at + delivery days)
}

export interface OrderListItem {
  orderId: string;
  platform: string;
  firstName: string;
  lastName: string;
  workflowStatus: DisplayStatus;      // NEW: Always shows workflow position
  technicalStatus?: DisplayStatus;    // NEW: Only set when errors exist
  status: DisplayStatus;              // Backward compatibility (deprecated)
  rawStatus: string;
  phase: OrderPhase;
  orderDate: string;
  characterHash?: string;
  reviewStages?: Order['reviewStages'];
  customerApprovalStatus?: string | null;
  hasFlags?: boolean;
  flags?: Record<string, any>;
  revisionCount?: number;
  errors?: DisplayStatus[]; // Array of errors for multiple errors badge
  lifecycle_status?: string; // Order lifecycle status: 'active' | 'recently_delivered' | 'archived'
}

export interface CustomerCorrection {
  reason?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  revisionCount?: number | null;
  submittedAt?: string | null;
  email?: string | null;
  name?: string | null;
}

export interface OrdersResponse {
  items: OrderListItem[];
  page: number;
  pageSize: number;
  total: number;
}

