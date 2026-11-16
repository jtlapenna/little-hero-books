import { isHistoricalBookConfigRef } from './books/book-legacy-compatibility';
import { extractManifestKey } from './order-paths';
import { claimTime, failureRecord, heldW2AFailure, W2A_PARENT_KEY } from './w2a-execution-failure';
export type W2AParentClaim = { orderRowId: number; orderId: string; startedAt: string; executionId: string };
export function parseW2AParentClaim(value: unknown): W2AParentClaim | null {
  const claim = failureRecord(value), startedAt = claimTime(claim?.startedAt);
  return claim && Number.isSafeInteger(claim.orderRowId) && Number(claim.orderRowId) > 0 && typeof claim.orderId === 'string' && claim.orderId.trim() === claim.orderId && claim.orderId && startedAt && typeof claim.executionId === 'string' && /^\d{1,30}$/.test(claim.executionId)
    ? { orderRowId: Number(claim.orderRowId), orderId: claim.orderId, startedAt, executionId: claim.executionId } : null;
}
export function w2aParentClaimFromInput(input: Record<string, unknown>): W2AParentClaim | null {
  const values = [input.workflowParentClaim, failureRecord(input.orderContext)?.workflowParentClaim].filter(value => value != null);
  const parsed = values.map(parseW2AParentClaim);
  if (!parsed.length || parsed.some(claim => !claim) || parsed.some(claim => JSON.stringify(claim) !== JSON.stringify(parsed[0]))) return null;
  return parsed[0];
}
export function assertActiveW2AParentRow(row: Record<string, unknown> | null, claim: W2AParentClaim): asserts row is Record<string, unknown> {
  const owner = failureRecord(failureRecord(row?.product_info)?.[W2A_PARENT_KEY]);
  if (owner && JSON.stringify(parseW2AParentClaim(owner)) !== JSON.stringify(claim)) throw Error('A different execution owns this W2A parent claim');
  if (!row || row.id !== claim.orderRowId || row.orderId !== claim.orderId || row.execution_status !== 'processing' ||
      row.current_workflow !== '2A' || claimTime(row.started_at) !== claim.startedAt || heldW2AFailure(row) ||
      row.print_submission_id || row.print_claim_token || row.gelato_order_id || row.manifest_2b_url || row.manifest_3_url) throw Error('W2A parent claim is stopped, changed or owned by another stage');
}
export async function readActiveW2AParent(claim: W2AParentClaim): Promise<Record<string, unknown>> {
  const { supabase } = await import('./supabase-client');
  const { data, error } = await supabase.from('orders').select('*').eq('id', claim.orderRowId).maybeSingle();
  if (error) throw Error('W2A parent claim could not be verified');
  assertActiveW2AParentRow(data, claim); return data;
}
export async function requireActiveW2AParent(input: Record<string, unknown>, orderId: string): Promise<{ claim: W2AParentClaim; row: Record<string, unknown> }> {
  const claim = w2aParentClaimFromInput(input);
  if (!claim || claim.orderId !== orderId) throw Error('A current physical W2A parent claim is required');
  return { claim, row: await readActiveW2AParent(claim) };
}

export function assertFrozenW2AParentSelection(row: Record<string, unknown>, input: { orderId: string; bookId: string; oneManifestUrl: string | null; characterHash?: string | null; formatId?: string | null; configVersion?: number | null; configuredW0?: boolean }): void {
  const configured = input.configuredW0 === true || !isHistoricalBookConfigRef({ bookId: input.bookId, version: input.configVersion ?? 1, formatId: input.formatId ?? 'standard' });
  if (configured && (typeof row.print_book_id !== 'string' || !row.print_book_id || typeof row.print_format_id !== 'string' || !row.print_format_id || !Number.isSafeInteger(row.print_config_version) || Number(row.print_config_version) < 1 || typeof row.character_hash !== 'string' || !row.character_hash)) throw Error('Configured W2A requires a complete frozen book, format, version and character assignment');
  const key = extractManifestKey(String(row.one_manifest_url ?? ''));
  if (row.orderId !== input.orderId || !key || extractManifestKey(input.oneManifestUrl) !== key ||
      row.print_book_id != null && row.print_book_id !== input.bookId || row.print_format_id != null && row.print_format_id !== input.formatId ||
      row.print_config_version != null && row.print_config_version !== input.configVersion ||
      row.character_hash != null && row.character_hash !== input.characterHash || row.print_book_id && !row.character_hash) throw Error('W2A frozen order assignment differs from the validated input');
}

/** Reserve ordinary and retry parent executions before any paid work. */
export async function admitW2AParentExecution(row: Record<string, unknown>, claim: W2AParentClaim): Promise<Record<string, unknown>> {
  assertActiveW2AParentRow(row,claim);
  const rawInfo=row.product_info;
  const info=failureRecord(rawInfo) ?? (Array.isArray(rawInfo) ? {items:rawInfo} : rawInfo == null ? {} : null);
  if (!info) throw Error('W2A parent metadata must be an object or raw line-item array; no metadata was changed');
  if (info[W2A_PARENT_KEY]) return row;
  if (typeof row.updated_at !== 'string') throw Error('Parent admission requires a current revision');
  const {supabase}=await import('./supabase-client');
  const now=new Date(Math.max(Date.now(),new Date(row.updated_at).getTime()+1)).toISOString();
  const saved=await supabase.from('orders').update({product_info:{...info,[W2A_PARENT_KEY]:claim},updated_at:now})
    .eq('id',claim.orderRowId).eq('orderId',claim.orderId).eq('updated_at',row.updated_at)
    .eq('execution_status','processing').eq('current_workflow','2A').eq('started_at',String(row.started_at)).select('*').maybeSingle();
  if (saved.error || !saved.data) throw Error('W2A parent admission changed; no generation was authorized');
  assertActiveW2AParentRow(saved.data,claim); return saved.data;
}
