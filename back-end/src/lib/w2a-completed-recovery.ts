import { isDeepStrictEqual } from 'node:util';
import { supabase } from './supabase-client';
import { downloadManifest } from './r2-service';
import { headObject, R2_PUBLIC_BUCKET } from './r2-client';
import { extractManifestKey, buildGeneratedPoseAssetKey } from './order-paths';
import { buildCanonicalBackendUrl } from './backend-url';
import { failureRecord, storedW2AFailure, W2A_FAILURE_KEY } from './w2a-execution-failure';
import { verifiedW2AFailure, assertLatestFailure, W2A_FAILURE_ORDER_FIELDS } from './w2a-failure-recovery';
import { assertFrozenW2AParentSelection } from './w2a-parent-claim';
import type { WorkflowJobRecord } from './workflow-jobs/types';

type Row = Record<string, unknown>;
export type CompletedW2ARecoveryScope = { orderId: string; executionId: string; claimStartedAt: string; updatedAt: string };

/** Read-only proof of complete canonical pose publication; never generates or replays. */
export async function verifyCompletedW2ARecovery(row: Row, jobs?: WorkflowJobRecord[]): Promise<{ manifestUrl: string; poseCount: number }> {
  const failure = storedW2AFailure(row);
  if (!failure || failure.resolvedAt || failure.orderRowId !== row.id || failure.orderId !== row.orderId ||
      row.execution_status !== 'error_requires_manual_review' || row.current_workflow || row.started_at ||
      row.manifest_2b_url || row.manifest_3_url || row.print_submission_id || row.print_claim_token || row.gelato_order_id) throw Error('Completion recovery requires the unchanged stopped W2A failure');
  const reviews = failureRecord(row.review_stages) ?? {};
  if (Object.values(reviews).some(value => failureRecord(value)?.status === 'approved')) throw Error('Completion recovery cannot replace an approved review');
  const verified = await verifiedW2AFailure(failure.executionId);
  if (verified.orderRowId !== row.id || verified.orderId !== row.orderId || verified.claimStartedAt !== failure.claimStartedAt || verified.failedAt !== failure.failedAt) throw Error('Completion failure evidence changed');
  await assertLatestFailure(verified);
  const { buildValidatedW2ABootstrapManifest } = await import('../app/api/internal/w2a/bootstrap-manifest/route');
  const built = await buildValidatedW2ABootstrapManifest({ orderId: row.orderId, oneManifestUrl: row.one_manifest_url });
  assertFrozenW2AParentSelection(row, built);
  const { resolveW2APoseWorklistResponse } = await import('../app/api/internal/w2a/resolve-pose-worklist/route');
  const worklist = await resolveW2APoseWorklistResponse({ orderId: row.orderId, oneManifestUrl: row.one_manifest_url, includeZeroPose: true }, { instrumentPoseWorkItems: async payload => payload.poseWorklist });
  if (!built.characterHash) throw Error('Frozen character hash is unavailable');
  const required = new Set(worklist.poseWorklist.map(item => item.poseNumber));
  if (!required.size) throw Error('Frozen pose worklist is empty');
  if (!jobs) {
    const result = await supabase.from('workflow_jobs').select('*').eq('order_id', String(row.orderId)).eq('stage','2a');
    if (result.error || !Array.isArray(result.data)) throw Error('Pose completion could not be verified');
    jobs = result.data as WorkflowJobRecord[];
  }
  if (jobs.length !== required.size || new Set(jobs.map(job => job.logical_key)).size !== required.size || jobs.some(job => job.status !== 'succeeded' || job.order_id !== row.orderId || job.book_id !== built.bookId || job.stage !== '2a' || job.job_type !== 'w2a-single-pose' || ![...required].some(n => job.logical_key === `pose-${String(n).padStart(2,'0')}`))) throw Error('Every frozen pose must have one successful generation job');
  const oneKey = extractManifestKey(String(row.one_manifest_url ?? ''));
  if (!oneKey?.endsWith('/1-manifest.json')) throw Error('Frozen W0 manifest path is unavailable');
  const key = oneKey.replace(/\/1-manifest\.json$/, '/2a-manifest.json');
  if (row.manifest_2a_url && extractManifestKey(String(row.manifest_2a_url)) !== key) throw Error('Current W2A manifest pointer differs from the frozen book');
  const manifest = failureRecord(await downloadManifest(key)), order = failureRecord(manifest?.order);
  const summary = failureRecord(manifest?.summary);
  if (!manifest || manifest.orderId !== row.orderId || order?.orderId !== row.orderId || manifest.bookId !== built.bookId || manifest.characterHash !== built.characterHash || extractManifestKey(String(order.oneManifestUrl ?? '')) !== oneKey || summary?.readyForBook !== true || summary.needsHumanReview !== false || !Array.isArray(manifest.entries) || manifest.entries.length !== required.size || Array.isArray(manifest.reviewQueue) && manifest.reviewQueue.length) throw Error('Canonical W2A manifest is incomplete or differs from the frozen book');
  const seen = new Set<number>();
  for (const value of manifest.entries) {
    const entry = failureRecord(value), n = entry?.poseNumber;
    if (!Number.isInteger(n) || !required.has(Number(n)) || seen.has(Number(n)) || entry?.status !== 'approved' || entry.approved !== true || entry.needsReview !== false || entry.isFlagged === true || entry.approvedKey !== buildGeneratedPoseAssetKey(built.characterHash, Number(n), built.bookId)) throw Error('Every frozen pose must have one current approved canonical image');
    seen.add(Number(n));
    if (!(await headObject(R2_PUBLIC_BUCKET, String(entry.approvedKey))).ok) throw Error('An approved canonical pose image is unavailable');
  }
  const fresh = await supabase.from('workflow_jobs').select('*').eq('order_id', String(row.orderId)).eq('stage','2a');
  if (fresh.error || !Array.isArray(fresh.data)) throw Error('Final pose state could not be verified');
  const jobFingerprint = (values: WorkflowJobRecord[]) => values.map(job => ({ id:job.id,status:job.status,attempt:job.attempt_count,revision:job.updated_at,result:job.result_snapshot,logicalKey:job.logical_key })).sort((a,b)=>a.id-b.id);
  if (!isDeepStrictEqual(jobFingerprint(jobs),jobFingerprint(fresh.data as WorkflowJobRecord[])) || !isDeepStrictEqual(manifest, failureRecord(await downloadManifest(key)))) throw Error('Pose publication changed during completion inspection; refresh before finalizing');
  return { manifestUrl: buildCanonicalBackendUrl(`/api/manifests/${key}`), poseCount: required.size };
}

export async function finalizeCompletedW2ARecovery(scope: CompletedW2ARecoveryScope, actor: string) {
  const proof = await verifiedW2AFailure(scope.executionId);
  const read = await supabase.from('orders').select(W2A_FAILURE_ORDER_FIELDS).eq('id',proof.orderRowId).maybeSingle();
  if (read.error || !read.data) throw Error('Completion recovery order is unavailable');
  const row = read.data as Row, stored = storedW2AFailure(row);
  if (scope.orderId !== row.orderId || scope.updatedAt !== row.updated_at || scope.claimStartedAt !== stored?.claimStartedAt || scope.executionId !== stored.executionId) throw Error('Failure revision changed; refresh before finalizing');
  const complete = await verifyCompletedW2ARecovery(row);
  const info = failureRecord(row.product_info); if (!info) throw Error('Order metadata cannot be preserved');
  const now = new Date().toISOString();
  const result = await supabase.from('orders').update({ workflow_step:'2A-complete',manifest_2a_url:complete.manifestUrl,
    execution_status:'done',current_workflow:null,started_at:null,next_workflow:null,next_retry_at:null,
    error_type:null,error_message:null,updated_at:now,
    product_info:{...info,[W2A_FAILURE_KEY]:{...stored,resolvedAt:now,resolvedBy:actor}},
  }).eq('id',proof.orderRowId).eq('orderId',scope.orderId).eq('updated_at',scope.updatedAt)
    .eq('execution_status','error_requires_manual_review').is('current_workflow',null).is('started_at',null).select('id').maybeSingle();
  if (result.error || !result.data) throw Error('Completion ownership changed; refresh before continuing');
  return { finalized:true,orderId:scope.orderId,manifestUrl:complete.manifestUrl,dispatchStarted:false };
}
