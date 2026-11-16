/** Failure evidence is observational; every mutation revalidates the saved n8n execution and claim. */
export const W2A_ORCHESTRATOR_ID = 'HduzTWm0ekmrvwrn';
export const W2A_FAILURE_KEY = '_w2a_failure';
export const W2A_PARENT_KEY = '_w2a_parent_claim';
export type W2AFailureCode = 'w2a_provider_billing' | 'w2a_provider_auth' | 'w2a_generation_failed';
export type W2AFailure = {
  schema: 'lhb.w2a-failure@1'; executionId: string; orderId: string; orderRowId: number;
  claimStartedAt: string; failedAt: string; code: W2AFailureCode; message: string; failedNode: string;
  sourceExecutionIds: string[]; bootstrapExecutionId?: string; bootstrapClaimStartedAt?: string; resolvedAt?: string; resolvedBy?: string;
};
type Row = Record<string, unknown>;
export function failureRecord(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}
export function claimTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  const parts = input.match(/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)?$/);
  if (!parts) return null;
  const date = new Date(input.replace(' ', 'T') + (parts[2] ? '' : 'Z'));
  // PostgreSQL claims may carry microseconds: retain them when comparing ownership.
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19) + '.' + (parts[1] ?? '').padEnd(6, '0') + 'Z' : null;
}
export function originalW2AClaim(execution: unknown): { orderId: string; orderRowId: number; startedAt: string } | null {
  const root = failureRecord(execution);
  if (!root || root.workflowId !== W2A_ORCHESTRATOR_ID) return null;
  const result = failureRecord(failureRecord(root.data)?.resultData);
  const runs = failureRecord(result?.runData)?.['Webhook (Router)'];
  if (!Array.isArray(runs) || runs.length !== 1) return null;
  const data = failureRecord(failureRecord(runs[0])?.data);
  const main = data?.main;
  if (!Array.isArray(main) || !Array.isArray(main[0]) || main[0].length !== 1) return null;
  const json = failureRecord(failureRecord(main[0][0])?.json), body = failureRecord(json?.body);
  if (!body || typeof body.orderId !== 'string' || body.orderId !== body.orderId.trim() || !body.orderId ||
      !Number.isSafeInteger(body.id) || Number(body.id) < 1) return null;
  const startedAt = claimTime(body.started_at);
  return startedAt ? { orderId: body.orderId, orderRowId: Number(body.id), startedAt } : null;
}
export function linkedFailureExecutionId(execution: unknown): string | null {
  const root = failureRecord(execution), result = failureRecord(failureRecord(root?.data)?.resultData);
  const error = failureRecord(result?.error), id = error?.executionId;
  return typeof id === 'string' && /^\d{1,30}$/.test(id) && id !== root?.id ? id : null;
}
export function verifyFailureChild(parent: unknown, child: unknown): boolean {
  const p = failureRecord(parent), c = failureRecord(child), relation = failureRecord(failureRecord(c?.data)?.parentExecution);
  const nodes = failureRecord(p?.workflowData)?.nodes;
  const allowed = Array.isArray(nodes) ? nodes.flatMap(n => {
    const node = failureRecord(n), parameters = failureRecord(node?.parameters), workflow = parameters?.workflowId;
    const id = typeof workflow === 'string' ? workflow : failureRecord(workflow)?.value;
    return node?.type === 'n8n-nodes-base.executeWorkflow' && typeof id === 'string' ? [id] : [];
  }) : [];
  return Boolean(p && c && relation && linkedFailureExecutionId(p) === c.id && relation.executionId === p.id &&
    relation.workflowId === p.workflowId && allowed.includes(String(c.workflowId)) &&
    ['error', 'success', 'canceled', 'crashed'].includes(String(c.status)) && claimTime(c.stoppedAt));
}
export function buildW2AFailure(execution: unknown, children: unknown[] = []): W2AFailure {
  const root = failureRecord(execution), claim = originalW2AClaim(root);
  const failedAt = claimTime(root?.stoppedAt), startedAt = claimTime(root?.startedAt);
  if (!root || !claim || root.status !== 'error' || typeof root.id !== 'string' || !/^\d{1,30}$/.test(root.id) ||
      !failedAt || !startedAt || failedAt < startedAt || claim.startedAt > startedAt) throw Error('A saved, stopped W2A error with its original claim is required');
  let parent: unknown = root;
  for (const child of children) { if (!verifyFailureChild(parent, child)) throw Error('W2A child execution does not match the failed parent'); parent = child; }
  if (linkedFailureExecutionId(parent)) throw Error('W2A child failure evidence is incomplete');
  const messages: string[] = [];
  for (const value of [root, ...children]) {
    const item = failureRecord(value), result = failureRecord(failureRecord(item?.data)?.resultData);
    const error = failureRecord(result?.error);
    for (const text of [error?.message, error?.description]) if (typeof text === 'string') messages.push(text);
    const runs = failureRecord(result?.runData) ?? {};
    for (const runList of Object.values(runs)) if (Array.isArray(runList)) for (const run of runList) {
      const main = failureRecord(failureRecord(run)?.data)?.main;
      if (!Array.isArray(main)) continue;
      for (const branch of main) if (Array.isArray(branch)) for (const entry of branch) {
        const error = failureRecord(failureRecord(failureRecord(entry)?.json)?.error);
        for (const text of [error?.message, error?.description]) if (typeof text === 'string') messages.push(text);
      }
    }
  }
  const combined = messages.join(' ').toLowerCase();
  const billing = /prepayment credits|prepaid credits|payment required|billing.*(?:depleted|disabled)/.test(combined);
  const auth = !billing && /api key.*(?:invalid|not valid)|unauthenticated|permission denied/.test(combined);
  const code: W2AFailureCode = billing ? 'w2a_provider_billing' : auth ? 'w2a_provider_auth' : 'w2a_generation_failed';
  const message = billing ? 'Gemini image generation is blocked because its prepaid credits are depleted. Restore the project balance, then queue W2A again.'
    : auth ? 'Image generation could not authenticate with its provider. Correct the provider connection before queueing W2A again.'
      : 'W2A stopped before completing character generation. Review the failed execution and resolve its cause before retrying.';
  const result = failureRecord(failureRecord(root.data)?.resultData);
  const failedNode = typeof result?.lastNodeExecuted === 'string' ? result.lastNodeExecuted.replace(/[\r\n]/g, ' ').slice(0, 120) : 'W2A';
  return { schema: 'lhb.w2a-failure@1', executionId: root.id, orderId: claim.orderId, orderRowId: claim.orderRowId, claimStartedAt: claim.startedAt,
    failedAt, code, message, failedNode, sourceExecutionIds: [root, ...children].map(v => String(failureRecord(v)?.id)),
  };
}
export function storedW2AFailure(row: unknown): W2AFailure | null {
  const data = failureRecord(row), info = failureRecord(data?.product_info), value = failureRecord(info?.[W2A_FAILURE_KEY]);
  if (!value || value.schema !== 'lhb.w2a-failure@1' || typeof value.executionId !== 'string' || !/^\d{1,30}$/.test(value.executionId) ||
      value.orderId !== data?.orderId || value.orderRowId !== data?.id || !claimTime(value.claimStartedAt) || !claimTime(value.failedAt) ||
      !['w2a_provider_billing', 'w2a_provider_auth', 'w2a_generation_failed'].includes(String(value.code)) ||
      typeof value.message !== 'string' || !Array.isArray(value.sourceExecutionIds)) return null;
  return value as W2AFailure;
}
export function heldW2AFailure(row: unknown): boolean {
  const data = failureRecord(row);
  if (storedW2AFailure(data) && !storedW2AFailure(data)?.resolvedAt) return true;
  return Boolean(data && ['error', 'error_requires_manual_review'].includes(String(data.execution_status)) && typeof data.error_type === 'string' && data.error_type.startsWith('w2a_'));
}
