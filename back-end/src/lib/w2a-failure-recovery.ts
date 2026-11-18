import { isDeepStrictEqual } from 'node:util';
import canonicalW2AWorkflow from '../../../docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json';
import { supabase } from './supabase-client';
import { listN8NExecutions, listN8NExecutionPage, readN8NExecution } from './n8n-recovery-client';
import { W2A_ORCHESTRATOR_ID, W2A_FAILURE_KEY, W2A_PARENT_KEY, buildW2AFailure, claimTime, failureRecord, heldW2AFailure,
  linkedFailureExecutionId, originalW2AClaim, storedW2AFailure, verifyFailureChild, type W2AFailure } from './w2a-execution-failure';

type Row = Record<string, unknown>;
async function assertEarlyRestartAssets(row: Row) {
  const [{ buildValidatedW2ABootstrapManifest }, { verifyEmptyW2ARestart }] = await Promise.all([
    import('../app/api/internal/w2a/bootstrap-manifest/route'), import('./books/w2a-bootstrap-retry'),
  ]);
  const details = { ...(failureRecord(row.product_info) ?? {}) }; delete details[W2A_FAILURE_KEY]; delete details[W2A_PARENT_KEY];
  const built = await buildValidatedW2ABootstrapManifest({ orderId: row.orderId, rootOrderId: row.root_order_id ?? row.amazon_order_id,
    amazonOrderId: row.amazon_order_id ?? row.root_order_id, oneManifestUrl: row.one_manifest_url, orderDetails: details });
  await verifyEmptyW2ARestart(row, built, 'preflight');
}
export const W2A_FAILURE_ORDER_FIELDS = 'id,orderId,root_order_id,amazon_order_id,workflow_step,execution_status,current_workflow,next_workflow,started_at,updated_at,manifest_2a_url,manifest_2b_url,manifest_3_url,one_manifest_url,product_info,error_type,error_message,last_error_at,retry_count,review_stages,print_submission_id,print_claim_token,gelato_order_id,character_hash,print_book_id,print_format_id,print_config_version';
export type W2AFailureInspection = {
  failure: W2AFailure | null; failureRecorded: boolean; canRecordFailure: boolean; safeToRetry: boolean;
  failureLookupError: string | null; failureRevision: string | null;
};
async function readPhysicalOrder(id: number): Promise<Row> {
  const result = await supabase.from('orders').select(W2A_FAILURE_ORDER_FIELDS).eq('id', id).maybeSingle();
  if (result.error) throw Error('W2A failure order lookup failed');
  if (!result.data) throw Error('W2A failure order was not found');
  return result.data as Row;
}
async function hasPoseJobs(orderId: string): Promise<boolean> {
  const result = await supabase.from('workflow_jobs').select('id').eq('order_id', orderId).eq('stage', '2a').limit(1);
  if (result.error || !Array.isArray(result.data)) throw Error('W2A pose progress could not be verified');
  return result.data.length > 0;
}
export async function readStoppedW2AFailure(executionId: string): Promise<{ root: unknown; failure: W2AFailure }> {
  const root = await readN8NExecution(executionId), children: unknown[] = [];
  let parent = root;
  for (let depth = 0; linkedFailureExecutionId(parent); depth++) {
    if (depth >= 4) throw Error('W2A failure chain exceeds the inspection limit');
    const child = await readN8NExecution(linkedFailureExecutionId(parent)!);
    if (!verifyFailureChild(parent, child)) throw Error('Linked W2A execution is unverified or still running');
    children.push(child); parent = child;
  }
  return {root, failure: buildW2AFailure(root, children)};
}
export async function verifiedW2AFailure(executionId: string): Promise<W2AFailure> {
  const {root,failure}=await readStoppedW2AFailure(executionId);
  if (failureRecord(root)?.retryOf) {
    const { mapNativeRetryFailure } = await import('./w2a-native-retry');
    return mapNativeRetryFailure(await readPhysicalOrder(failure.orderRowId),failureRecord(root)!,failure);
  }
  return failure;
}
export async function assertLatestFailure(failure: W2AFailure, strict = false): Promise<void> {
  const current=await readPhysicalOrder(failure.orderRowId);
  const reserved=failureRecord(failureRecord(current.product_info)?.[W2A_PARENT_KEY]);
  const reservedOwner=reserved?.executionId === failure.executionId && claimTime(reserved.startedAt) === failure.claimStartedAt;
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 5; page++) {
    const result = await listN8NExecutionPage(100, W2A_ORCHESTRATOR_ID, cursor);
    for (const entry of result.entries) {
      if (entry.id === failure.executionId) return;
      if (BigInt(entry.id) < BigInt(failure.executionId)) continue;
      const detail=await readN8NExecution(entry.id),claim = originalW2AClaim(detail);
      if(strict && (failureRecord(detail)?.id!==entry.id || failureRecord(detail)?.workflowId!==W2A_ORCHESTRATOR_ID))throw Error('Newer W2A execution ownership is unverified; inspect workflow history');
      if(strict && isVerifiedW2AFailureObserver(detail,failure))continue;
      if(strict && !claim)throw Error('Newer W2A execution ownership is unverified; inspect workflow history');
      if (!strict && reservedOwner && claim?.orderId === failure.orderId && claim.orderRowId === failure.orderRowId && claim.startedAt === failure.claimStartedAt) continue;
      if (claim?.orderId === failure.orderId && claim.orderRowId === failure.orderRowId) throw Error('A newer W2A execution exists; refresh recovery before continuing');
    }
    if (!result.nextCursor || seen.has(result.nextCursor)) break;
    seen.add(result.nextCursor); cursor = result.nextCursor;
  }
  throw Error('Saved failure is visible, but its newer execution history could not be fully verified. Inspect workflow history before recovery');
}
function ownsProcessingClaim(row: Row, failure: W2AFailure): boolean {
  const owner=failureRecord(failureRecord(row.product_info)?.[W2A_PARENT_KEY]);
  if (owner && (owner.executionId !== failure.executionId || claimTime(owner.startedAt) !== failure.claimStartedAt)) return false;
  return row.id === failure.orderRowId && row.orderId === failure.orderId && row.execution_status === 'processing' &&
    row.current_workflow === '2A' && claimTime(row.started_at) === failure.claimStartedAt &&
    typeof row.updated_at === 'string' && !row.print_submission_id && !row.print_claim_token && !row.gelato_order_id;
}
function hasRecordedFailure(row: Row, failure: W2AFailure): boolean {
  const stored = storedW2AFailure(row);
  return Boolean(stored && !stored.resolvedAt && heldW2AFailure(row) && stored.executionId === failure.executionId &&
    stored.claimStartedAt === failure.claimStartedAt && stored.failedAt === failure.failedAt &&
    row.error_type === failure.code && row.error_message === failure.message && claimTime(row.last_error_at) === failure.failedAt);
}
function earlyRetryState(row: Row, failure: W2AFailure): boolean {
  const reviews = failureRecord(row.review_stages) ?? {};
  return hasRecordedFailure(row, failure) && row.workflow_step === 'order_intake' && !row.started_at && !row.current_workflow &&
    typeof row.one_manifest_url === 'string' && Boolean(row.one_manifest_url) &&
    !row.manifest_2a_url && !row.manifest_2b_url && !row.manifest_3_url && !row.print_submission_id && !row.print_claim_token && !row.gelato_order_id &&
    !Object.values(reviews).some(review => failureRecord(review)?.status === 'approved');
}
export async function inspectW2AFailure(row: Row): Promise<W2AFailureInspection> {
  const out: W2AFailureInspection = { failure: null, failureRecorded: false, canRecordFailure: false, safeToRetry: false,
    failureLookupError: null, failureRevision: typeof row.updated_at === 'string' ? row.updated_at : null };
  try {
    const durable = storedW2AFailure(row);
    const reserved=failureRecord(failureRecord(row.product_info)?.[W2A_PARENT_KEY]);
    const entries = durable && !durable.resolvedAt ? [{ id: durable.executionId }] : typeof reserved?.executionId === 'string' ? [{id:reserved.executionId}] : await listN8NExecutions(40, W2A_ORCHESTRATOR_ID);
    for (const entry of entries) {
      const full = await readN8NExecution(entry.id), claim = originalW2AClaim(full);
      if (!claim || claim.orderRowId !== row.id || claim.orderId !== row.orderId) continue;
      // The latest matching execution is authoritative, including a newer running/successful run.
      if (failureRecord(full)?.status !== 'error') return out;
      const failure = await verifiedW2AFailure(entry.id);
      const stored = storedW2AFailure(row);
      out.failure = stored?.executionId === failure.executionId && stored.resolvedAt ? { ...failure, resolvedAt: stored.resolvedAt } : failure;
      out.failureRecorded = hasRecordedFailure(row, failure);
      out.canRecordFailure = ownsProcessingClaim(row, failure);
      if (earlyRetryState(row, failure) && !(await hasPoseJobs(failure.orderId))) { await assertLatestFailure(failure); await assertEarlyRestartAssets(row); out.safeToRetry = true; }
      return out;
    }
  } catch (error) {
    out.failureLookupError = error instanceof Error ? error.message : 'W2A failure evidence could not be verified';
  }
  return out;
}
/** Idempotent failure correction only. Never dispatches, generates images or changes frozen book data. */
export async function recordW2AExecutionFailure(executionId: string, expected?: { orderId: string; updatedAt: string }) {
  const failure = await verifiedW2AFailure(executionId), row = await readPhysicalOrder(failure.orderRowId);
  if (expected && (row.orderId !== expected.orderId || row.updated_at !== expected.updatedAt)) throw Error('Order changed; refresh recovery before syncing failure');
  if (hasRecordedFailure(row, failure)) return { recorded: true, alreadyRecorded: true, failure };
  if (!ownsProcessingClaim(row, failure)) return { recorded: false, stale: true, failure };
  await assertLatestFailure(failure);
  const info = row.product_info == null ? {} : failureRecord(row.product_info);
  if (!info) throw Error('Order metadata could not be preserved');
  const update = { execution_status: 'error_requires_manual_review', error_type: failure.code, error_message: failure.message,
    last_error_at: failure.failedAt, current_workflow: null, started_at: null, next_workflow: '2A', next_retry_at: null,
    updated_at: new Date().toISOString(), product_info: { ...info, [W2A_FAILURE_KEY]: failure } };
  const result = await supabase.from('orders').update(update).eq('id', failure.orderRowId).eq('orderId', failure.orderId)
    .eq('execution_status', 'processing').eq('current_workflow', '2A').eq('started_at', String(row.started_at))
    .eq('updated_at', String(row.updated_at)).select('id').maybeSingle();
  if (result.error) throw Error('W2A failure state could not be saved');
  if (!result.data) {
    if (hasRecordedFailure(await readPhysicalOrder(failure.orderRowId), failure)) return { recorded: true, alreadyRecorded: true, failure };
    throw Error('Order ownership changed while recording failure; refresh recovery');
  }
  return { recorded: true, alreadyRecorded: false, failure };
}
export async function queueEarlyW2ARetry(input: { orderId: string; executionId: string; claimStartedAt: string; updatedAt: string; resolvedCause: boolean; actor: string }) {
  if (input.resolvedCause !== true) throw Error('Resolve the underlying cause before queueing W2A again');
  const failure = await verifiedW2AFailure(input.executionId), row = await readPhysicalOrder(failure.orderRowId);
  if (input.orderId !== failure.orderId || input.claimStartedAt !== failure.claimStartedAt || row.updated_at !== input.updatedAt || !earlyRetryState(row, failure)) throw Error('This failure revision is no longer safe to retry; refresh recovery');
  await assertLatestFailure(failure);
  await assertEarlyRestartAssets(row);
  if (await hasPoseJobs(failure.orderId)) throw Error('Pose jobs now exist; use pose recovery instead');
  const info = failureRecord(row.product_info); if (!info) throw Error('Order metadata could not be preserved');
  const now = new Date().toISOString();
  const retryInfo={...info}; delete retryInfo[W2A_PARENT_KEY];
  const result = await supabase.from('orders').update({ execution_status: 'ready_for_processing', next_workflow: '2A',
    current_workflow: null, started_at: null, queued_at: now, next_retry_at: null, error_type: null, error_message: null,
    retry_count: Number(row.retry_count ?? 0) + 1, updated_at: now,
    product_info: { ...retryInfo, [W2A_FAILURE_KEY]: { ...failure, resolvedAt: now, resolvedBy: input.actor } },
  }).eq('id', failure.orderRowId).eq('orderId', failure.orderId).eq('execution_status', String(row.execution_status))
    .is('current_workflow', null).is('started_at', null).eq('updated_at', input.updatedAt)
    .eq('error_type', failure.code).eq('error_message', failure.message).select('id').maybeSingle();
  if (result.error || !result.data) throw Error('Retry was not confirmed; refresh order status before trying again');
  return { queued: true, orderId: failure.orderId, nextWorkflow: '2A', dispatchStarted: false };
}

/** A completed, isolated error observer records a failure; it cannot acquire or generate a book. */
export function isVerifiedW2AFailureObserver(execution: unknown, expected: W2AFailure): boolean {
  const root=failureRecord(execution),data=failureRecord(root?.data),result=failureRecord(data?.resultData);
  const started=claimTime(root?.startedAt),stopped=claimTime(root?.stoppedAt);
  if(!root || root.workflowId!==W2A_ORCHESTRATOR_ID || typeof root.id!=='string' || !/^\d{1,30}$/.test(root.id) ||
    root.mode!=='error' || root.status!=='success' || root.finished!==true || !started || !stopped || stopped<started ||
    root.retryOf!=null || root.retrySuccessId!=null || root.waitTill!=null || data?.parentExecution!=null || result?.error!=null) return false;
  const startData=failureRecord(data?.startData),executionData=failureRecord(data?.executionData);
  if(!startData || Object.keys(startData).length || !executionData || !Array.isArray(executionData.nodeExecutionStack) || executionData.nodeExecutionStack.length ||
    ['waitingExecution','waitingExecutionSource'].some(key=>executionData[key]!=null && (!failureRecord(executionData[key]) || Object.keys(executionData[key] as object).length)))return false;
  const triggerName='W2A Error Trigger',reportName='Report W2A Execution Failure';
  const workflow=failureRecord(root.workflowData),nodes=workflow?.nodes,connections=failureRecord(workflow?.connections);
  if(workflow?.id!==W2A_ORCHESTRATOR_ID || !Array.isArray(nodes))return false;
  const find=(name:string)=>nodes.filter(node=>failureRecord(node)?.name===name);
  const triggers=find(triggerName),reports=find(reportName);
  if(triggers.length!==1 || reports.length!==1)return false;
  const trigger=failureRecord(triggers[0]),report=failureRecord(reports[0]);
  const canonicalTrigger=canonicalW2AWorkflow.nodes.find(node=>node.name===triggerName)!;
  const canonical=canonicalW2AWorkflow.nodes.find(node=>node.name===reportName)!;
  function canonicalParameters(value:unknown,defaults:Record<string,unknown>):Record<string,unknown>|null {
    const parameters=failureRecord(value);if(!parameters)return null;
    const normalized=structuredClone(parameters);
    // n8n persists these explicit defaults when the canonical nodes are opened/saved.
    for(const [key,defaultValue] of Object.entries(defaults))if(key in normalized){if(!isDeepStrictEqual(normalized[key],defaultValue))return null;delete normalized[key];}
    const response=failureRecord(failureRecord(failureRecord(normalized.options)?.response)?.response);
    if(response)for(const key of ['fullResponse','neverError'])if(key in response){if(response[key]!==false)return null;delete response[key];}
    return normalized;
  }
  const triggerParameters=canonicalParameters(trigger?.parameters,{notice:''});
  const parameters=canonicalParameters(report?.parameters,{specifyHeaders:'keypair',provideSslCertificates:false,sendQuery:false,preBuiltAgentsCalloutHttpRequest:'',curlImport:'',infoMessage:''});

  if(trigger?.type!=='n8n-nodes-base.errorTrigger' || report?.type!=='n8n-nodes-base.httpRequest' || trigger.disabled===true || report.disabled===true ||
    trigger.typeVersion!==canonicalTrigger.typeVersion || report.typeVersion!==canonical.typeVersion ||
    !isDeepStrictEqual(triggerParameters,canonicalTrigger.parameters) || !isDeepStrictEqual(parameters,canonical.parameters) ||
    !isDeepStrictEqual(connections?.[triggerName],{main:[[{node:reportName,type:'main',index:0}]]}) ||
    connections?.[reportName]!=null && !isDeepStrictEqual(connections[reportName],{main:[]}) ||
    result?.lastNodeExecuted!==reportName)return false;
  const runData=failureRecord(result.runData);
  if(!runData || !isDeepStrictEqual(Object.keys(runData).sort(),[triggerName,reportName].sort()))return false;
  function single(name:string,source:unknown):Record<string,unknown>|null {
    const values=runData![name];if(!Array.isArray(values) || values.length!==1)return null;
    const run=failureRecord(values[0]),main=failureRecord(run?.data)?.main;
    if(run?.executionStatus!=='success' || run.error!=null || !isDeepStrictEqual(run.source,source) || !Array.isArray(main) || main.length!==1 || !Array.isArray(main[0]) || main[0].length!==1)return null;
    return failureRecord(failureRecord(main[0][0])?.json);
  }
  const event=single(triggerName,[]),ack=single(reportName,[{previousNode:triggerName}]);
  const eventExecution=failureRecord(event?.execution),eventWorkflow=failureRecord(event?.workflow),raw=failureRecord(ack?.failure);
  if(ack?.success!==true || ack.recorded!==true || ack.stale===true || !raw || eventWorkflow?.id!==W2A_ORCHESTRATOR_ID ||
    eventExecution?.id!==raw.executionId || typeof raw.executionId!=='string' || !/^\d{1,30}$/.test(raw.executionId) || BigInt(raw.executionId)>=BigInt(root.id) ||
    !Number.isSafeInteger(raw.orderRowId) || Number(raw.orderRowId)<1 || typeof raw.orderId!=='string' || !raw.orderId || raw.orderId.trim()!==raw.orderId)return false;
  const reported=storedW2AFailure({id:raw.orderRowId,orderId:raw.orderId,product_info:{[W2A_FAILURE_KEY]:raw}});
  const claimStarted=claimTime(reported?.claimStartedAt),failed=claimTime(reported?.failedAt);
  if(!reported || reported.resolvedAt || !claimStarted || !failed || failed<claimStarted || failed>started ||
    typeof reported.failedNode!=='string' || !reported.failedNode || !reported.message || !reported.sourceExecutionIds.length ||
    reported.sourceExecutionIds[0]!==reported.executionId || new Set(reported.sourceExecutionIds).size!==reported.sourceExecutionIds.length ||
    reported.sourceExecutionIds.some(id=>typeof id!=='string' || !/^\d{1,30}$/.test(id)))return false;
  if(reported.executionId===expected.executionId && !isDeepStrictEqual(reported,expected))return false;
  return reported.orderRowId===expected.orderRowId || reported.orderId===expected.orderId
    ? isDeepStrictEqual(reported,expected) : true;
}
