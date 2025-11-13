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
  luluStatus?: string;
  executionStatus?: string; // execution_status from Supabase (processing, error, error_requires_manual_review, etc.)
  errorMessage?: string; // error_message from Supabase
  errorType?: string; // error_type from Supabase
  retryCount?: number; // retry_count from Supabase
  oneManifestUrl?: string; // one_manifest_url from Supabase
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
}

export interface OrderListItem {
  orderId: string;
  platform: string;
  firstName: string;
  lastName: string;
  status: DisplayStatus;
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

