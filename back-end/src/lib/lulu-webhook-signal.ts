import { supabase } from '@/lib/supabase-client';

type SupabaseLike = typeof supabase;

const NON_PRODUCTION_LULU_STATUS_PATTERN = /^(SKIPPED|DRY_RUN|TEST_MODE|SANDBOX(?:[_-].+)?)$/i;
const NON_PRODUCTION_LULU_JOB_ID_PATTERN = /^(SKIPPED|DRY_RUN|TEST[-_].+)$/i;

export type LuluWebhookDeliveryState =
  | 'not_applicable'
  | 'missing'
  | 'received'
  | 'error'
  | 'stale';

export type LuluWebhookSignal = {
  latestReceivedAt: string | null;
  latestStatus: string | null;
  latestUpdated: boolean | null;
  latestErrorMessage: string | null;
  deliveryState: LuluWebhookDeliveryState;
  deliveryReason: string;
};

export type LuluWebhookLogRow = {
  received_at?: string | null;
  status_name?: string | null;
  updated?: boolean | null;
  error_message?: string | null;
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isNonProductionLuluSubmission(input: {
  luluJobId?: string | null;
  currentStatus?: string | null;
}): boolean {
  const luluJobId = toTrimmedString(input.luluJobId);
  const currentStatus = toTrimmedString(input.currentStatus);

  return Boolean(
    (luluJobId && NON_PRODUCTION_LULU_JOB_ID_PATTERN.test(luluJobId)) ||
      (currentStatus && NON_PRODUCTION_LULU_STATUS_PATTERN.test(currentStatus)),
  );
}

export function buildLuluWebhookSignal(input: {
  luluJobId?: string | null;
  currentStatus?: string | null;
  webhookLog: LuluWebhookLogRow | null;
  loadError?: string | null;
}): LuluWebhookSignal {
  const luluJobId = toTrimmedString(input.luluJobId);
  if (!luluJobId) {
    return {
      latestReceivedAt: null,
      latestStatus: null,
      latestUpdated: null,
      latestErrorMessage: null,
      deliveryState: 'not_applicable',
      deliveryReason: 'no_lulu_job_id',
    };
  }

  if (isNonProductionLuluSubmission(input)) {
    return {
      latestReceivedAt: null,
      latestStatus: toTrimmedString(input.currentStatus),
      latestUpdated: null,
      latestErrorMessage: null,
      deliveryState: 'not_applicable',
      deliveryReason: 'non_production_submission',
    };
  }

  if (input.loadError) {
    return {
      latestReceivedAt: null,
      latestStatus: null,
      latestUpdated: null,
      latestErrorMessage: input.loadError,
      deliveryState: 'error',
      deliveryReason: 'webhook_log_lookup_failed',
    };
  }

  if (!input.webhookLog) {
    return {
      latestReceivedAt: null,
      latestStatus: null,
      latestUpdated: null,
      latestErrorMessage: null,
      deliveryState: 'missing',
      deliveryReason: 'no_webhook_log_entries',
    };
  }

  const latestReceivedAt = toIsoString(input.webhookLog.received_at);
  const latestStatus = toTrimmedString(input.webhookLog.status_name);
  const latestUpdated =
    typeof input.webhookLog.updated === 'boolean' ? input.webhookLog.updated : null;
  const latestErrorMessage = toTrimmedString(input.webhookLog.error_message);
  const currentStatus = toTrimmedString(input.currentStatus);

  if (latestErrorMessage || latestUpdated === false) {
    return {
      latestReceivedAt,
      latestStatus,
      latestUpdated,
      latestErrorMessage,
      deliveryState: 'error',
      deliveryReason: latestErrorMessage ? 'webhook_update_failed' : 'webhook_not_applied',
    };
  }

  if (currentStatus && latestStatus && currentStatus !== latestStatus) {
    return {
      latestReceivedAt,
      latestStatus,
      latestUpdated,
      latestErrorMessage,
      deliveryState: 'stale',
      deliveryReason: 'order_status_differs_from_latest_webhook',
    };
  }

  return {
    latestReceivedAt,
    latestStatus,
    latestUpdated,
    latestErrorMessage,
    deliveryState: 'received',
    deliveryReason: 'latest_webhook_applied',
  };
}

export async function loadLatestLuluWebhookLog(
  printJobId: string,
  client: SupabaseLike = supabase,
): Promise<LuluWebhookLogRow | null> {
  const trimmed = toTrimmedString(printJobId);
  if (!trimmed) {
    return null;
  }

  const { data, error } = await client
    .from('lulu_webhook_log')
    .select('received_at, status_name, updated, error_message')
    .eq('print_job_id', trimmed)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as LuluWebhookLogRow | null;
}
