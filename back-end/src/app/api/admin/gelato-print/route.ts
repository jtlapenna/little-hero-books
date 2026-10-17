import { canCancelGelatoOrder } from '@/lib/books/gelato-status';
import { gelatoLifecycleRuntime } from '@/lib/books/gelato-lifecycle-runtime';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { gelatoSubmissionStore } from '@/lib/books/gelato-submission-store';
import { refreshGelatoSubmission, recoverGelatoSubmission, cancelGelatoSubmission } from '@/lib/books/gelato-lifecycle';
import { GelatoSavedSnapshotSchema } from '@/lib/books/gelato-submission';
import type { GelatoPrintInspection } from '@/lib/books/gelato-admin-inspection';

export const dynamic = 'force-dynamic';
async function inspect(orderId: string) {
  const order = await getOrderFromSupabase(orderId);
  if (!order || order.print_provider !== 'gelato') throw new Error('Gelato order not found');
  if (!order.print_submission_id) return { orderId, submissionId: null, state: 'not_submitted', orders: [], items: [], notifications: [], canRefresh: false, canRecover: false, canCancel: false };
  const context = await gelatoSubmissionStore.load(order.print_submission_id);
  if (!context.members.some((member) => member.child_order_key === orderId && member.child_order_id === order.id)) throw new Error('Gelato submission target mismatch');
  const [{ data: notifications, error: notificationError }, { data: active, error: activeError }, { data: job, error: jobError }] = await Promise.all([
    supabase.from('print_provider_submission_notifications').select('id,notification_type,delivery_state,attempt_result').eq('submission_id', context.submission.id),
    supabase.from('orders').select('id').eq('print_submission_id', context.submission.id),
    supabase.from('gelato_scheduled_status').select('enabled,registered_at,last_attempt_at,last_success_at,next_attempt_at,last_result,last_error_class,active_interval_seconds,terminal_interval_seconds,terminal_until').eq('submission_id', context.submission.id).maybeSingle(),
  ]);
  if (notificationError || activeError || jobError) throw new Error('Gelato inspection details unavailable');
  const activeIds = new Set((active ?? []).map((entry) => entry.id));
  const saved = context.submission.request_snapshot ?? context.submission.quote_snapshot;
  const monetaryQuote = saved ? GelatoSavedSnapshotSchema.parse(saved).monetaryQuote ?? null : null;
  const monitoringComplete = Boolean(job?.terminal_until && Date.parse(job.terminal_until) <= Date.now());
  const interval = job?.terminal_until ? job.terminal_interval_seconds : job?.active_interval_seconds;
  const checked = job?.last_success_at ?? job?.registered_at;
  const enabled = Boolean(job?.enabled && process.env.GELATO_SCHEDULED_STATUS_ENABLED === 'true');
  const polling = { registered: Boolean(job), enabled, lastAttemptAt: job?.last_attempt_at ?? null,
    lastSuccessfulCheckAt: job?.last_success_at ?? null, nextAttemptAt: job?.next_attempt_at ?? null,
    lastResult: job?.last_result ?? null, lastErrorClass: job?.last_error_class ?? null, monitoringComplete,
    stale: enabled && !monitoringComplete && (!checked || Date.now() - Date.parse(checked) > Math.max(600_000, Number(interval) * 2000)) };
  return { orderId, submissionId: context.submission.id, notifications: notifications ?? [], state: context.submission.request_state,
    canRefresh: context.submission.request_state === 'submitted',
    canCancel: process.env.GELATO_CANCEL_ENABLED === 'true' && context.submission.request_state === 'submitted' && context.providerOrders.length > 0 &&
      context.providerOrders.every((entry) => !entry.action_reason && canCancelGelatoOrder(entry.order_type ?? '', [entry.status, ...(entry.progress_status ? [entry.progress_status] : [])])) &&
      context.members.every((entry) => !entry.action_reason && canCancelGelatoOrder('order', [entry.status ?? '', ...(entry.progress_status ? [entry.progress_status] : [])])),
    canRecover: ['claimed', 'submitting', 'outcome_unknown'].includes(context.submission.request_state) && Date.parse(context.submission.lease_expires_at) <= Date.now(),
    monetaryQuote, polling,
    orders: context.providerOrders.map((entry) => ({ id: entry.provider_order_id, status: entry.status, orderType: entry.order_type, actionReason: entry.action_reason, updatedAt: entry.last_event_at,
      lastCheckedAt: entry.last_checked_at ?? null, financial: entry.financial_observation ?? null,
      financialObservedAt: entry.financial_observed_at ?? null, financialActionReason: entry.financial_action_reason ?? null })),
    items: context.members.map((member) => ({ active: activeIds.has(member.child_order_id), orderId: member.child_order_key, status: member.status, actionReason: member.action_reason,
      providerOrderId: member.provider_order_id, providerItemId: member.provider_item_id })) } satisfies GelatoPrintInspection & { orderId: string };
}
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return auth.response;
  const orderId = request.nextUrl.searchParams.get('orderId')?.trim();
  if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
  try { return NextResponse.json(await inspect(orderId)); }
  catch { return NextResponse.json({ error: 'Gelato print details unavailable' }, { status: 409 }); }
}
const Action = z.object({ orderId: z.string().trim().min(1), action: z.enum(['refresh', 'recover', 'cancel']) }).strict();
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return auth.response;
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Gelato print action' }, { status: 400 });
  try {
    const inspected = await inspect(parsed.data.orderId);
    if (!inspected.submissionId) throw new Error('Gelato action target missing');
    const action = parsed.data.action === 'refresh' ? refreshGelatoSubmission : parsed.data.action === 'recover' ? recoverGelatoSubmission : cancelGelatoSubmission;
    // Operator status/recovery actions must not construct customer message intents.
    const result = await action(inspected.submissionId, { ...gelatoLifecycleRuntime(), loadOrder: undefined });
    return NextResponse.json({ success: true, ...result });
  } catch { return NextResponse.json({ error: 'Gelato action was not confirmed. Reload details before retrying.' }, { status: 409 }); }
}
