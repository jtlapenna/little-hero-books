import { listN8NExecutionPage, readN8NExecution } from './n8n-recovery-client';
import { compareAndSetBookReview } from './book-review-invalidation';
import { claimTime, failureRecord } from './w2a-execution-failure';
import { supabase } from './supabase-client';

const W3_WORKFLOW_ID = 'D4rQ0zJG8JlKhZqq';
type Row = Record<string, unknown>;
const terminalErrors = new Set(['error', 'crashed', 'canceled']);
// Leave the backend time to wind down after an HTTP caller stops waiting.
const W3_CLAIM_GRACE_MS = 5 * 60_000;
const W3_DISPATCH_WINDOW_MS = 120_000;

export function requiresW3ClaimRecovery(row: Row): boolean {
  return (row.execution_status === 'processing' && row.current_workflow === '3') ||
    row.error_type === 'w3_assembly_failed';
}

async function listDispatches(start: string) {
  const candidates = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const { entries, nextCursor } = await listN8NExecutionPage(100, W3_WORKFLOW_ID, cursor);
    for (const entry of entries) {
      const runStart = claimTime(entry.startedAt);
      if (runStart && runStart >= start && Date.parse(runStart) - Date.parse(start) < W3_DISPATCH_WINDOW_MS) {
        candidates.push(entry);
      }
    }
    if (entries.some(entry => {
      const time = claimTime(entry.startedAt);
      return time && time < start;
    }) || !nextCursor) return candidates;
    cursor = nextCursor;
  }
  throw Error('W3 claim history exceeds the inspection limit');
}

function matchesW3Claim(row: Row, execution: unknown): boolean {
  const run = failureRecord(execution);
  const start = claimTime(row.started_at);
  if (row.execution_status !== 'processing' || row.current_workflow !== '3' || !start ||
      !run || run.workflowId !== W3_WORKFLOW_ID) return false;
  const runStart = claimTime(run.startedAt);
  if (!runStart || runStart < start) return false;
  const result = failureRecord(failureRecord(run.data)?.resultData);
  const nodes = failureRecord(result?.runData);
  const webhook = nodes?.['Webhook Trigger (Book Assembly)1'];
  if (!Array.isArray(webhook) || webhook.length !== 1) return false;
  const output = failureRecord(failureRecord(webhook[0])?.data)?.main;
  if (!Array.isArray(output) || !Array.isArray(output[0]) || output[0].length !== 1) return false;
  const json = failureRecord(failureRecord(output[0][0])?.json);
  const payload = failureRecord(json?.body) ?? json;
  return !!payload && !!row.orderId && payload.orderId === row.orderId &&
    String(payload.orderDbId ?? '') === String(row.id) && claimTime(payload.claimedAt) === start;
}

export function matchesStoppedW3Claim(row: Row, execution: unknown): boolean {
  const run = failureRecord(execution);
  const startedAt = claimTime(run?.startedAt), stoppedAt = claimTime(run?.stoppedAt);
  return !!startedAt && !!stoppedAt && stoppedAt >= startedAt &&
    terminalErrors.has(String(run?.status)) && matchesW3Claim(row, execution);
}

const recoveryPorts = {
  async hasBlockingAssemblyJob(orderId: string, claimStartedAt: string) {
    const { data, error } = await supabase.from('workflow_jobs').select('id')
      .eq('order_id', orderId).eq('stage', '3').gte('created_at', claimStartedAt)
      .not('status', 'in', '(failed,dead_lettered,canceled)').limit(1);
    if (error) throw Error('Could not check assembly job ownership');
    return !!data?.length;
  },
  list: listDispatches,
  read: readN8NExecution,
  update: compareAndSetBookReview,
  now: () => Date.now(),
};

export async function reconcileStoppedW3Claim(row: Row, ports = recoveryPorts): Promise<boolean> {
  const start = claimTime(row.started_at);
  if (row.execution_status !== 'processing' || row.current_workflow !== '3' || !start ||
      typeof row.orderId !== 'string' || !row.orderId || !row.id || !row.manifest_2b_url || row.manifest_3_url ||
      row.print_submission_id || row.print_claim_token || row.gelato_order_id || row.lulu_job_id) return false;
  const lastActivity = claimTime(row.updated_at) ?? start;
  if (ports.now() - Math.max(Date.parse(start), Date.parse(lastActivity)) < W3_CLAIM_GRACE_MS) return false;
  // An active job must be recovered through the workflow console first.
  if (await ports.hasBlockingAssemblyJob(row.orderId, start)) return false;
  const runs = await ports.list(start);
  const matches: Array<{ entry: typeof runs[number]; execution: unknown }> = [];
  for (const entry of runs) {
    const execution = await ports.read(entry.id);
    if (failureRecord(execution)?.id === entry.id && matchesW3Claim(row, execution)) {
      matches.push({ entry, execution });
    }
  }
  if (matches.length !== 1 || !matchesStoppedW3Claim(row, matches[0].execution)) return false;
  const { entry, execution } = matches[0];
  const error = failureRecord(failureRecord(failureRecord(execution)?.data)?.resultData)?.error;
  const timedOut = /timed out|timeout/i.test(String(failureRecord(error)?.message ?? ''));
  if (await ports.hasBlockingAssemblyJob(row.orderId, start)) return false;
  return ports.update(row, {
    execution_status: 'error_requires_manual_review', error_type: 'w3_assembly_failed',
    error_message: `W3 assembly ${timedOut ? 'timed out' : 'stopped'} before completing (execution ${entry.id}). Use Regenerate 3 to retry with the existing images.`,
    current_workflow: null, started_at: null, next_workflow: '3',
    last_error_at: new Date().toISOString(), next_retry_at: null, updated_at: new Date().toISOString(),
  });
}

export async function scanStoppedW3Claims() {
  const { data, error } = await supabase.from('orders').select('*')
    .eq('execution_status', 'processing').eq('current_workflow', '3')
    .lt('started_at', new Date(Date.now() - W3_CLAIM_GRACE_MS).toISOString())
    .order('started_at', { ascending: false });
  if (error) throw Error('Could not check order-row assembly claims');
  const summary = { checked: 0, markedForReview: 0, unavailable: 0 };
  for (const row of data ?? []) {
    summary.checked++;
    try {
      if (await reconcileStoppedW3Claim(row)) summary.markedForReview++;
    } catch {
      summary.unavailable++;
    }
  }
  return summary;
}
