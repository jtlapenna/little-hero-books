import { supabase } from './supabase-client';
import { validatePreviewReadToken, validatePreviewToken, type TokenValidationResult } from './preview-tokens';
import { buildManifestKeyHintOptionsFromOrderLike, resolveOrderPathContext } from './order-paths';

export const privatePreviewHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Preview-Token, Authorization',
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
} as const;

export type PreviewOrderRow = Record<string, unknown> & { id: string | number };
export type PreviewOrderAccess = {
  ok: true; row: PreviewOrderRow; orderId: string; tokenOrderId: string; validation: TokenValidationResult;
} | { ok: false; response: Response };

export function previewDenied(status = 401): { ok: false; response: Response } {
  return { ok: false, response: Response.json({ error: 'Preview access unavailable' }, { status, headers: privatePreviewHeaders }) };
}

export function canonicalPreviewOrderId(row: Record<string, unknown>): string | null {
  for (const name of ['orderId', 'order_id', 'amazon_order_id']) {
    if (typeof row[name] === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(row[name])) return row[name];
  }
  return null;
}

/** Exact matches only. A group with no explicit primary and several books is ambiguous. */
export async function findExactPreviewOrder(identifier: string, allowDisplayId = false): Promise<PreviewOrderRow | null> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(identifier)) return null;
  const columns = ['orderId', 'order_id', ...(allowDisplayId ? ['display_order_id'] : []),
    ...(/^\d+$/.test(identifier) ? ['id'] : []), 'root_order_id', 'amazon_order_id'];
  for (const column of columns) {
    const { data, error } = await supabase.from('orders').select('*').eq(column, identifier).limit(2);
    if (error?.code === '42703') continue;
    if (error) throw new Error('Preview order lookup failed');
    const rows = Array.isArray(data) ? data : [];
    if (rows.length > 1) return null;
    if (rows.length === 1) {
      const row = rows[0] as Record<string, unknown>;
      if ((typeof row.id !== 'number' && typeof row.id !== 'string') || !String(row.id).trim()) return null;
      if (!canonicalPreviewOrderId(row)) return null;
      return row as PreviewOrderRow;
    }
  }
  return null;
}

export async function authorizePreviewOrder(token: unknown, requestedOrderId?: string, mutation = false): Promise<PreviewOrderAccess> {
  const validation = mutation ? await validatePreviewToken(token) : await validatePreviewReadToken(token);
  if (!validation.valid || !validation.orderId) return { ok: false, response: Response.json({ valid: false, canApprove: false, error: validation.error ?? 'Invalid preview link', expired: validation.expired, used: validation.used }, { status: 401, headers: privatePreviewHeaders }) };
  const row = await findExactPreviewOrder(validation.orderId);
  if (!row) return previewDenied(404);
  const orderId = canonicalPreviewOrderId(row)!;
  if (requestedOrderId !== undefined && requestedOrderId !== orderId && requestedOrderId !== validation.orderId) return previewDenied(403);
  return { ok: true, row, orderId, tokenOrderId: validation.orderId, validation };
}

export function previewOrderPrefix(access: Extract<PreviewOrderAccess, { ok: true }>): string {
  const context = resolveOrderPathContext(access.orderId, buildManifestKeyHintOptionsFromOrderLike(access.row));
  const match = context.orderPrefix.match(/^([A-Za-z0-9_-]+)\/orders\/([A-Za-z0-9_-]+)$/);
  if (!match || ![access.orderId, access.tokenOrderId].includes(match[2])) throw new Error('Invalid preview path context');
  return context.orderPrefix;
}

/** Customer mutations never use the general root/fuzzy update fallbacks. */
export async function updateExactPreviewOrder(row: PreviewOrderRow, changes: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from('orders')
    .update({ ...changes, updated_at: new Date().toISOString() }).eq('id', row.id).select('id').single();
  if (error || !data || String(data.id) !== String(row.id)) throw new Error('Preview order update failed');
}

/** Atomically choose one customer action across all live links for this row. */
export async function transitionPreviewOrder(row: PreviewOrderRow, changes: Record<string, unknown>): Promise<boolean> {
  let query = supabase.from('orders').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', row.id);
  query = row.customer_approval_status == null
    ? query.is('customer_approval_status', null)
    : query.eq('customer_approval_status', row.customer_approval_status);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error('Preview order transition failed');
  return !!data && String(data.id) === String(row.id);
}

/** Email lookup may list an exact checkout group; it never grants preview/file authority. */
export async function findExactPreviewGroup(identifier: string): Promise<PreviewOrderRow[]> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(identifier)) return [];
  let root = identifier;
  if (/^LH-[A-Z0-9]{5}$/.test(identifier)) {
    const { data, error } = await supabase.from('orders').select('*').eq('display_order_id', `${identifier}-1`).limit(2);
    if (error) throw new Error('Order lookup failed');
    if (!Array.isArray(data) || data.length !== 1 || typeof data[0].root_order_id !== 'string') return [];
    root = data[0].root_order_id;
  }
  const { data, error } = await supabase.from('orders').select('*').eq('root_order_id', root).limit(21);
  if (error) throw new Error('Order lookup failed');
  if (!Array.isArray(data) || data.length < 2 || data.length > 20) return [];
  if (data.some(row => !canonicalPreviewOrderId(row) || row.id == null)) return [];
  // Short display roots must agree for every book, avoiding partial or colliding groups.
  if (root !== identifier && data.some(row => typeof row.display_order_id !== 'string' || !row.display_order_id.startsWith(`${identifier}-`))) return [];
  return data as PreviewOrderRow[];
}

/** Canonical row state required before a customer can approve or request a revision. */
export function previewMutationReady(row: Record<string, unknown>): boolean {
  const stages = row.review_stages as Record<string, { status?: unknown }> | null;
  const reviewed = String(stages?.postPdf?.status ?? stages?.post_pdf?.status ?? '').toLowerCase() === 'approved';
  return typeof row.manifest_3_url === 'string' && Boolean(row.manifest_3_url.trim()) &&
    ['book_assembly_completed', 'customer_approval'].includes(String(row.workflow_step)) && row.execution_status === 'done' &&
    !row.current_workflow && !row.started_at && reviewed && !row.print_submission_id && !row.lulu_job_id && !row.lulu_status;
}
export const PREVIEW_ACTION_SNAPSHOT_FIELDS = ['orderId', 'order_id', 'root_order_id', 'amazon_order_id', 'updated_at', 'manifest_3_url',
  'customer_approval_status', 'customer_approval_required', 'revision_count', 'execution_status', 'workflow_step', 'current_workflow', 'started_at',
  'review_stages', 'print_submission_id', 'lulu_job_id', 'lulu_status'] as const;
/** Requires the matching service-only transaction migration. Missing RPC fails closed. */
export async function commitPreviewTokenAction(row: PreviewOrderRow, token: string, action: 'approve' | 'reject', changes: Record<string, unknown>, revisionLimit: number | null = 1): Promise<boolean> {
  if (!previewMutationReady(row)) return false;
  const expected = Object.fromEntries(PREVIEW_ACTION_SNAPSHOT_FIELDS.map(name => [name, row[name] ?? null]));
  const { data, error } = await supabase.rpc('commit_customer_preview_action', {
    p_order_id: row.id, p_token: token, p_expected: expected, p_action: action, p_changes: changes, p_revision_limit: revisionLimit,
  });
  if (error) throw new Error('Preview action could not be confirmed. Reload before retrying.');
  return data === true;
}
