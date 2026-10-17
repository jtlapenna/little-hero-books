import type { GelatoFinancialObservation, GelatoMonetaryQuote } from './gelato-financial-observation';

export type GelatoPrintInspection = {
  submissionId: string | null; state: string; canRefresh: boolean; canRecover: boolean; canCancel?: boolean;
  orders: Array<{ id: string; status: string; orderType: string | null; actionReason: string | null;
    updatedAt?: string | null; lastCheckedAt?: string | null; financial?: GelatoFinancialObservation | null;
    financialObservedAt?: string | null; financialActionReason?: string | null }>;
  items: Array<{ active?: boolean; orderId: string; status: string | null; actionReason?: string | null; providerOrderId?: string | null; providerItemId?: string | null }>;
  notifications?: Array<{ id: string; notification_type: string; delivery_state: string; attempt_result: string | null }>;
  monetaryQuote?: GelatoMonetaryQuote | null;
  polling?: { registered: boolean; enabled: boolean; lastAttemptAt: string | null; lastSuccessfulCheckAt: string | null;
    nextAttemptAt: string | null; lastResult: string | null; lastErrorClass: string | null; stale: boolean; monitoringComplete: boolean } | null;
};
