import type { GelatoFinancialObservation, GelatoMonetaryQuote } from './gelato-financial-observation';

export type GelatoPrintInspection = {
  submissionId: string | null; state: string; canRefresh: boolean; canRecover: boolean; canCancel?: boolean; canRetry?: boolean;
  orders: Array<{ id: string; status: string; orderType: string | null; actionReason: string | null;
    updatedAt?: string | null; lastCheckedAt?: string | null; financial?: GelatoFinancialObservation | null;
    financialObservedAt?: string | null; financialActionReason?: string | null }>;
  items: Array<{ active?: boolean; orderId: string; status: string | null; actionReason?: string | null; providerOrderId?: string | null; providerItemId?: string | null }>;
  notifications?: Array<{ id: string; notification_type: string; delivery_state: string; attempt_result: string | null }>;
  monetaryQuote?: GelatoMonetaryQuote | null;
  polling?: { registered: boolean; enabled: boolean; lastAttemptAt: string | null; lastSuccessfulCheckAt: string | null;
    nextAttemptAt: string | null; lastResult: string | null; lastErrorClass: string | null; stale: boolean; monitoringComplete: boolean } | null;
};

/** A print attempt that failed before anything was sent can be retired and queued again: no provider orders exist. */
export function canRetryFailedUnsentPrint(input: { state: string; providerOrderCount: number; itemProviderOrderIds: Array<string | null | undefined> }): boolean {
  return input.state === 'failed' && input.providerOrderCount === 0 && input.itemProviderOrderIds.every((id) => !id);
}
