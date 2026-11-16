import { canonicalJsonSha256 } from '../canonical-json-sha256';
import { failureRecord, storedW2AFailure, claimTime } from '../w2a-execution-failure';
import { assertActiveW2AParentRow, assertFrozenW2AParentSelection, type W2AParentClaim } from '../w2a-parent-claim';
import { buildBaseCharacterAssetKey } from '../order-paths';
import type { BuildW2ABootstrapManifestResult } from './w2a-manifest';
export interface W2ABootstrapRetryPorts {
  readOrder(id: number): Promise<Record<string, unknown> | null>;
  hasPoseJobs(orderId: string): Promise<boolean>;
  loadBootstrap(key: string): Promise<unknown | null>;
  baseExists(key: string): Promise<boolean>;
}
export async function bootstrapRetryPorts(): Promise<W2ABootstrapRetryPorts> {
  const [{ supabase }, storage] = await Promise.all([import('../supabase-client'), import('../r2-client')]);
  return {
    async readOrder(id) { const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle(); if (error) throw Error('Retry order could not be verified'); return data; },
    async hasPoseJobs(orderId) { const { data, error } = await supabase.from('workflow_jobs').select('id').eq('order_id', orderId).eq('stage', '2a').limit(1); if (error || !data) throw Error('Retry pose state could not be verified'); return data.length > 0; },
    async loadBootstrap(key) { try { const response = await storage.getObject(storage.R2_ORDERS_BUCKET, key, { allowNotFound: true }); if (response.status === 404) return null; return await response.json(); } catch { throw Error('Existing W2A bootstrap could not be verified'); } },
    async baseExists(key) { try { return (await storage.headObject(storage.R2_PUBLIC_BUCKET, key)).status !== 404; } catch { throw Error('Base character absence could not be verified'); } },
  };
}
function content(value: unknown): unknown {
  const manifest = failureRecord(value); if (!manifest) throw Error('Existing bootstrap is malformed');
  const copy = { ...manifest }; delete copy.runStamp; delete copy.generatedAt; return copy;
}
/** Read-only admission. Existing objects are never deleted, rewritten or trusted by path alone. */
export async function verifyEmptyW2ARestart(row: Record<string, unknown>, built: BuildW2ABootstrapManifestResult & { formatId?: string | null; configVersion?: number | null; configuredW0?: boolean },
  mode: 'preflight' | 'bootstrap', claim?: W2AParentClaim, injected?: W2ABootstrapRetryPorts): Promise<void> {
  const ports = injected ?? await bootstrapRetryPorts(), proof = storedW2AFailure(row);
  assertFrozenW2AParentSelection(row, built);
  if (!proof || proof.orderId !== built.orderId || proof.orderRowId !== row.id || row.workflow_step !== 'order_intake' ||
      row.manifest_2a_url || row.manifest_2b_url || row.manifest_3_url || row.print_submission_id || row.print_claim_token || row.gelato_order_id) throw Error('Only an unchanged early W2A failure may restart');
  if (mode === 'bootstrap') {
    if (!claim || !proof.resolvedAt || !claimTime(proof.resolvedAt) || claim.startedAt < claimTime(proof.resolvedAt)! || claim.startedAt <= proof.claimStartedAt) throw Error('Bootstrap reuse requires the acknowledged new processing claim');
    assertActiveW2AParentRow(row, claim);
  } else if (proof.resolvedAt) throw Error('This failure was already queued; refresh recovery');
  const revision = row.updated_at;
  const existing = await ports.loadBootstrap(built.manifestKey);
  if (existing !== null && canonicalJsonSha256(content(existing)) !== canonicalJsonSha256(content(built.manifest))) throw Error('Existing W2A manifest has progress or changed identity; inspect it before recovery');
  if (await ports.hasPoseJobs(built.orderId)) throw Error('Pose jobs exist; automatic early restart is unavailable');
  if (await ports.baseExists(buildBaseCharacterAssetKey(built.characterHash!, built.bookId))) throw Error('A base character already exists; inspect it before recovery instead of overwriting it');
  const current = await ports.readOrder(proof.orderRowId);
  const guarded = ['execution_status','current_workflow','started_at','workflow_step','manifest_2a_url','manifest_2b_url','manifest_3_url','print_submission_id','print_claim_token','gelato_order_id','one_manifest_url','character_hash','print_book_id','print_format_id','print_config_version'];
  if (!current || current.updated_at !== revision || guarded.some(field => JSON.stringify(current[field] ?? null) !== JSON.stringify(row[field] ?? null)) || canonicalJsonSha256(current.product_info) !== canonicalJsonSha256(row.product_info)) throw Error('W2A retry state changed during inspection');
  if (mode === 'bootstrap') assertActiveW2AParentRow(current, claim!);
}

/** One n8n execution owns an acknowledged early restart. Duplicate parent webhooks cannot share it. */
export async function admitW2ABootstrapRestart(row: Record<string, unknown>, claim: W2AParentClaim): Promise<Record<string, unknown>> {
  assertActiveW2AParentRow(row, claim);
  const proof = storedW2AFailure(row), info = failureRecord(row.product_info);
  if (!proof?.resolvedAt || !info) throw Error('Acknowledged retry evidence is unavailable');
  if (proof.bootstrapExecutionId) {
    if (proof.bootstrapExecutionId === claim.executionId && proof.bootstrapClaimStartedAt === claim.startedAt) return row;
    throw Error('Another execution already owns this W2A restart');
  }
  const { supabase } = await import('../supabase-client');
  const { data, error } = await supabase.from('orders').update({ updated_at: new Date(Math.max(Date.now(), new Date(String(row.updated_at)).getTime() + 1)).toISOString(), product_info: {
    ...info, _w2a_failure: { ...proof, bootstrapExecutionId: claim.executionId, bootstrapClaimStartedAt: claim.startedAt },
  } }).eq('id', claim.orderRowId).eq('orderId', claim.orderId).eq('updated_at', String(row.updated_at))
    .eq('execution_status', 'processing').eq('current_workflow', '2A').eq('started_at', String(row.started_at)).select('*').maybeSingle();
  if (error || !data) throw Error('W2A restart ownership changed; inspect the current run');
  return data;
}
