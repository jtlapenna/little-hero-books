/** Narrow native failed-node continuation. It never restarts the bootstrap or replays accepted poses. */
import { isDeepStrictEqual } from 'node:util';
import { supabase } from './supabase-client';
import { readN8NExecution, n8nRecoveryBaseUrl } from './n8n-recovery-client';
import { failureRecord as record, storedW2AFailure, originalW2AClaim, W2A_ORCHESTRATOR_ID, W2A_PARENT_KEY, W2A_FAILURE_KEY, claimTime, type W2AFailure } from './w2a-execution-failure';
import { parseW2AParentClaim, w2aParentClaimFromInput, assertActiveW2AParentRow, type W2AParentClaim } from './w2a-parent-claim';
import { getObject, R2_PUBLIC_BUCKET } from './r2-client';
import { buildGeneratedPoseAssetKey, extractManifestKey } from './order-paths';
import type { WorkflowJobRecord } from './workflow-jobs/types';

type Row = Record<string, unknown>;
export const NATIVE_RETRY_KEY = '_w2a_native_retry';
type ImageProof = { key: string; sha256: string; bytes: number };
type Admission = {
  schema: 'lhb.w2a-native-retry@1'; phase: 'prepared' | 'dispatching' | 'adopted'; preparedBy: string; preparedAt: string;
  sourceClaim: W2AParentClaim; sourceFailure: W2AFailure; sourceInput: Row; jobs: WorkflowJobRecord[];
  firstPose: number; images: ImageProof[]; currentClaim?: W2AParentClaim;
};
function same(a: unknown,b: unknown) { return isDeepStrictEqual(a,b); }
function sameFrozen(key:string,a:unknown,b:unknown) { return key==='oneManifestUrl' || key==='oneManifestKey' ? extractManifestKey(typeof a==='string'?a:null)===extractManifestKey(typeof b==='string'?b:null) : same(a,b); }
function admission(row: Row): Admission | null {
  const value = record(record(row.product_info)?.[NATIVE_RETRY_KEY]);
  return value?.schema === 'lhb.w2a-native-retry@1' ? value as unknown as Admission : null;
}
async function physical(id: number): Promise<Row> {
  const result = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (result.error || !result.data) throw Error('Native retry order could not be verified');
  return result.data;
}
async function jobsFor(orderId: string): Promise<WorkflowJobRecord[]> {
  const result = await supabase.from('workflow_jobs').select('*').eq('order_id', orderId).eq('stage','2a');
  if (result.error || !Array.isArray(result.data)) throw Error('Native retry jobs could not be verified');
  return (result.data as WorkflowJobRecord[]).sort((a,b)=>a.id-b.id);
}
function held(row: Row, failure: W2AFailure) {
  if (row.id !== failure.orderRowId || row.orderId !== failure.orderId || row.execution_status !== 'error_requires_manual_review' || row.current_workflow || row.started_at ||
      row.manifest_2a_url || row.manifest_2b_url || row.manifest_3_url || row.print_submission_id || row.print_claim_token || row.gelato_order_id ||
      !same(storedW2AFailure(row),failure) || failure.resolvedAt || Object.values(record(row.review_stages) ?? {}).some(r=>record(r)?.status==='approved')) throw Error('Native retry requires the unchanged held partial run');
}
export type NativeW2ARecoveryStatus = {
  phase: 'unprepared' | 'prepared' | 'dispatching' | 'adopted' | 'blocked';
  canPrepare: boolean; canResume: boolean; message: string;
  retainedPoses: number[]; remainingPoses: number[];
};
/** Read-only UI guidance. Preparation and dispatch independently revalidate every proof. */
export function inspectNativeW2ARecovery(row: Row, failure: W2AFailure | null, currentJobs: WorkflowJobRecord[]): NativeW2ARecoveryStatus {
  const blocked = (message: string): NativeW2ARecoveryStatus => ({ phase:'blocked', canPrepare:false, canResume:false, message, retainedPoses:[], remainingPoses:[] });
  const raw = record(row.product_info)?.[NATIVE_RETRY_KEY], value = admission(row);
  const claim = parseW2AParentClaim(record(row.product_info)?.[W2A_PARENT_KEY]);
  if (value?.phase === 'dispatching' || value?.phase === 'adopted') {
    const source = parseW2AParentClaim(value.sourceClaim), current = parseW2AParentClaim(value.currentClaim);
    if (!source || source.orderRowId !== row.id || source.orderId !== row.orderId ||
        !same(claim,value.phase === 'adopted' ? current : source) ||
        value.phase === 'adopted' && (!current || current.orderRowId !== row.id || current.orderId !== row.orderId)) return blocked('Saved continuation does not match the current order. Inspect its execution.');
    return {
      ...blocked(value.phase === 'dispatching' ? 'A continuation was reserved. Its outcome may be unconfirmed. Refresh the order and inspect its execution before taking another action.' : 'A continuation was already accepted. Follow the current order status; this saved recovery cannot be started again.'), phase:value.phase,
    };
  }
  if (!failure) return blocked('The stopped failure must be verified before recovery.');
  try { held(row,failure); } catch { return blocked('This order is no longer an unchanged stopped partial run. Refresh its current status.'); }
  if (typeof row.updated_at !== 'string' || !row.updated_at) return blocked('A fresh order revision is required.');
  if (raw === undefined) return { ...blocked('Check the stopped run and retained images before resuming. This check does not generate images.'), phase:'unprepared',canPrepare:true };
  if (!value || value.phase !== 'prepared' || !same(value.sourceFailure,failure) || !same(value.sourceClaim,claim) ||
      claim?.orderRowId !== row.id || claim?.orderId !== row.orderId || claim?.executionId !== failure.executionId ||
      !Number.isInteger(value.firstPose) || value.firstPose < 1 || value.firstPose > 99 || !Array.isArray(value.jobs) || value.jobs.some(job=>!record(job) || typeof job.logical_key!=='string')) return blocked('Saved recovery evidence differs from this failure. Inspect the order before continuing.');
  const poses = value.jobs.map(job => /^pose-\d{2}$/.test(job.logical_key) ? Number(job.logical_key.slice(5)) : -1).sort((a,b)=>a-b);
  if (!same([...currentJobs].sort((a,b)=>a.id-b.id),value.jobs) || poses.length <= value.firstPose || poses.length > 100 || poses.some((pose,index)=>pose!==index) || value.jobs.some(job=>job.order_id!==row.orderId || job.stage!=='2a')) return blocked('The saved pose worklist is incomplete. Inspect the order before continuing.');
  return { phase:'prepared',canPrepare:true,canResume:true,message:'A saved resume plan is available. Resuming rechecks the retained images and continues at the interrupted pose.',retainedPoses:poses.slice(0,value.firstPose),remainingPoses:poses.slice(value.firstPose) };
}
function runs(root: Row,name: string): Row[] {
  const result = record(record(root.data)?.resultData), values = record(result?.runData)?.[name];
  if (!Array.isArray(values)) return [];
  return values.flatMap(run=>{
    const main = record(record(run)?.data)?.main;
    return Array.isArray(main) ? main.flatMap(branch=>Array.isArray(branch)?branch.map(item=>record(record(item)?.json)).filter((r):r is Row=>Boolean(r)):[]) : [];
  });
}
const frozenFields = ['orderId','bookId','formatId','configVersion','renderSnapshot','poseIdentityContract','characterHash','poseNumber','oneManifestKey','oneManifestUrl','baseCharacterKey','poseRefKey'];
/** Pure source→job proof, shared by preparation and its regression fixture. */
export function proveNativeRetrySource(row: Row, root: Row, jobs: WorkflowJobRecord[]): Omit<Admission,'images'|'preparedBy'|'preparedAt'|'phase'|'schema'> {
  const failure = storedW2AFailure(row); if (!failure) throw Error('Stopped failure is unavailable'); held(row,failure);
  const sourceClaim = parseW2AParentClaim(record(row.product_info)?.[W2A_PARENT_KEY]);
  const original = originalW2AClaim(root);
  if (!sourceClaim || sourceClaim.executionId !== failure.executionId || root.id !== failure.executionId || root.workflowId !== W2A_ORCHESTRATOR_ID || root.status !== 'error' ||
      !same(original,{orderId:sourceClaim.orderId,orderRowId:sourceClaim.orderRowId,startedAt:sourceClaim.startedAt}) || sourceClaim.startedAt !== failure.claimStartedAt) throw Error('Native retry source does not own this physical order');
  const stack = record(record(root.data)?.executionData)?.nodeExecutionStack;
  if (!Array.isArray(stack) || stack.length !== 1 || record(record(stack[0])?.node)?.name !== 'Execute SW1 - Pose Generation') throw Error('Only a saved single-pose SW1 failure can continue natively');
  const main = record(record(stack[0])?.data)?.main;
  if (!Array.isArray(main) || !Array.isArray(main[0]) || main[0].length !== 1) throw Error('Saved failed-node input is ambiguous');
  const sourceInput = record(record(main[0][0])?.json); if (!sourceInput) throw Error('Saved failed input is unavailable');
  const target = jobs.find(j=>j.id===sourceInput.workflowJobId), previous = record(target?.normalized_input_snapshot), proof=record(sourceInput.qaRetryProof);
  const firstPose=Number(previous?.poseNumber);
  if (!target || target.status!=='succeeded' || !previous || !Number.isInteger(firstPose) || firstPose<1 || firstPose>99 || sourceInput.poseNumber!==firstPose ||
      !same(w2aParentClaimFromInput(sourceInput),sourceClaim) || !same(parseW2AParentClaim(previous.workflowParentClaim),sourceClaim) ||
      sourceInput.retryAttempt!==Number(previous.retryAttempt ?? 0)+1 || Number(sourceInput.retryAttempt)>3 ||
      sourceInput.qaPass!==false || proof?.schema!=='lhb.w2a-qa-rejection@1' || proof.jobId!==target.id || proof.attempt!==target.attempt_count || proof.retryAttempt!==previous.retryAttempt ||
      !same(parseW2AParentClaim(proof.workflowParentClaim),sourceClaim) || proof.uploadKey!==target.result_snapshot?.uploadKey || proof.generatedFileName!==target.result_snapshot?.generatedFileName) throw Error('Native continuation needs the exact rejected generated attempt');
  const oneKey=String(row.one_manifest_url ?? '').replace(/^.*\/api\/manifests\//,'');
  if (previous.orderId!==row.orderId || previous.bookId!==row.print_book_id || previous.formatId!==row.print_format_id || previous.configVersion!==row.print_config_version || previous.characterHash!==row.character_hash || !String(previous.oneManifestUrl ?? '').endsWith(oneKey)) throw Error('Native retry frozen selection differs from the order');
  for (const key of frozenFields.filter(k=>k!=='orderId')) if (!sameFrozen(key,sourceInput[key] ?? null,previous[key] ?? null)) throw Error('Saved retry changes frozen input: '+key);
  const published = runs(root,'SW3 - Upload');
  const acceptedInputs=runs(root,'IF: QA Combined Pass?').filter(j=>record(record(j.qa)?.combined)?.pass===true);
  const poseNumbers=jobs.map(j=>Number(j.logical_key.replace(/^pose-/,''))).sort((a,b)=>a-b);
  if (!jobs.length || jobs.length>100 || poseNumbers.some((n,i)=>n!==i)) throw Error('Native pose job set is incomplete or ambiguous');
  for (const job of jobs) {
    const n=Number(job.logical_key.replace(/^pose-/,''));
    if (job.order_id!==row.orderId || job.book_id!==row.print_book_id || job.stage!=='2a' || job.job_type!=='w2a-single-pose') throw Error('Native retry contains a foreign job');
    if (n<firstPose) {
      const inputs=acceptedInputs.filter(j=>j.poseNumber===n && j.workflowJobId===job.id);
      if(inputs.length!==1)throw Error('Retained pose has no unique accepted source input');
      const source=inputs[0];
      const matches=published.filter(j=>j.poseNumber===n && j.correlationId===source.correlationId && j.generatedFileName===source.generatedFileName && j.uploadKey===source.uploadKey);
      if(job.status!=='succeeded' || !source.correlationId || !source.generatedFileName || matches.length!==1 || matches[0].qaPass!==true || record(record(matches[0].qa)?.combined)?.pass!==true || matches[0].success!==true || matches[0].uploadSuccess!==true ||
          matches[0].approvedKey!==buildGeneratedPoseAssetKey(String(row.character_hash),n,String(row.print_book_id)) || matches[0].orderId!==row.orderId ||
          !same(parseW2AParentClaim(source.workflowParentClaim),sourceClaim) || source.workflowAttempt!==job.attempt_count || source.uploadKey!==job.result_snapshot?.uploadKey ||
          source.characterHash!==row.character_hash || source.bookId!==row.print_book_id || source.formatId!==row.print_format_id || source.configVersion!==row.print_config_version ||
          job.normalized_input_snapshot?.characterHash!==row.character_hash || job.normalized_input_snapshot?.poseNumber!==n) throw Error('Retained pose publication provenance is incomplete');
      for(const key of ['workflowJobId','workflowAttempt','workflowParentClaim','bookId','formatId','configVersion'])if(matches[0][key]!==undefined && !same(matches[0][key],source[key]))throw Error('Retained upload acknowledgement conflicts with its accepted source');
    } else if (n>firstPose && (job.status!=='queued' || job.attempt_count!==0)) throw Error('Later poses have already progressed; inspect instead of retrying');
  }
  return {sourceClaim,sourceFailure:failure,sourceInput,firstPose,jobs};
}
async function imageProof(key:string):Promise<ImageProof> {
  const response=await getObject(R2_PUBLIC_BUCKET,key,{signal:AbortSignal.timeout(10000),redirect:'manual'});
  const limit=10*1024*1024, reader=response.body?.getReader(); if (!reader) throw Error('Retained image is unavailable');
  const chunks:Uint8Array[]=[];let length=0;
  for (;;) {const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit){await reader.cancel();throw Error('Retained image exceeds inspection limit');}chunks.push(part.value);}
  if (!length) throw Error('Retained image is empty');
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');return {key,bytes:length,sha256};
}
async function currentProofs(value: Admission) {
  if (!same(await jobsFor(value.sourceClaim.orderId),value.jobs)) throw Error('Pose job history changed; prepare recovery again');
  for(const image of value.images)if(!same(await imageProof(image.key),image))throw Error('Retained image changed; inspect before continuing');
}
export async function prepareNativeW2ARetry(scope:{orderId:string;executionId:string;updatedAt:string},actor:string) {
  const {verifiedW2AFailure,assertLatestFailure}=await import('./w2a-failure-recovery');
  const failure=await verifiedW2AFailure(scope.executionId),row=await physical(failure.orderRowId);
  if(row.orderId!==scope.orderId || row.updated_at!==scope.updatedAt)throw Error('Recovery revision changed');
  if(admission(row) && admission(row)?.phase!=='prepared')throw Error('Native retry was already consumed; inspect its outcome before another preparation');
  await assertLatestFailure(failure);
  const {resolveW2APoseWorklistResponse}=await import('../app/api/internal/w2a/resolve-pose-worklist/route');
  const expected=await resolveW2APoseWorklistResponse({orderId:row.orderId,oneManifestUrl:row.one_manifest_url,includeZeroPose:true},{instrumentPoseWorkItems:async payload=>payload.poseWorklist});
  const required=expected.poseWorklist.map(item=>item.poseNumber).sort((a,b)=>a-b);
  const actualJobs=await jobsFor(scope.orderId);
  if(!same(required,actualJobs.map(job=>Number(job.logical_key.replace(/^pose-/,''))).sort((a,b)=>a-b)))throw Error('Native retry requires the complete frozen pose worklist');
  const proof=proveNativeRetrySource(row,record(await readN8NExecution(failure.executionId))!,actualJobs);
  const target=proof.jobs.find(j=>j.id===proof.sourceInput.workflowJobId)!;
  const attempt=await supabase.from('workflow_job_attempts').select('*').eq('id',record(proof.sourceInput.qaRetryProof)?.attemptId).maybeSingle();
  if(attempt.error || !attempt.data || attempt.data.job_id!==target.id || attempt.data.attempt!==target.attempt_count || attempt.data.status!=='succeeded' || !attempt.data.ended_at)throw Error('Rejected generation attempt history is incomplete');
  const images:ImageProof[]=[];
  for(const key of [String(target.normalized_input_snapshot?.baseCharacterKey),...Array.from({length:proof.firstPose},(_,n)=>buildGeneratedPoseAssetKey(String(row.character_hash),n,String(row.print_book_id)))])images.push(await imageProof(key));
  const value:Admission={...proof,images,schema:'lhb.w2a-native-retry@1',phase:'prepared',preparedAt:new Date().toISOString(),preparedBy:actor};
  await currentProofs(value);
  const saved=await supabase.from('orders').update({updated_at:new Date().toISOString(),product_info:{...record(row.product_info),[NATIVE_RETRY_KEY]:value}}).eq('id',row.id).eq('updated_at',row.updated_at).eq('execution_status','error_requires_manual_review').is('current_workflow',null).is('started_at',null).select('id,updated_at').maybeSingle();
  if(saved.error || !saved.data)throw Error('Order changed during recovery preparation');
  return {prepared:true,dispatchStarted:false,retainedPoses:Array.from({length:proof.firstPose},(_,n)=>n),nextPose:proof.firstPose,updatedAt:saved.data.updated_at};
}
export async function dispatchNativeW2ARetry(scope:{orderId:string;executionId:string;updatedAt:string},actor:string) {
  const read=await supabase.from('orders').select('*').eq('orderId',scope.orderId).maybeSingle();if(read.error || !read.data)throw Error('Recovery order unavailable');
  const row=read.data as Row,value=admission(row);if(!value || value.phase!=='prepared' || value.sourceClaim.executionId!==scope.executionId || row.updated_at!==scope.updatedAt)throw Error('A fresh prepared native retry is required');
  held(row,value.sourceFailure);await currentProofs(value);
  const {assertLatestFailure}=await import('./w2a-failure-recovery');await assertLatestFailure(value.sourceFailure);
  const now=new Date().toISOString();
  const reserved=await supabase.from('orders').update({updated_at:now,product_info:{...record(row.product_info),[NATIVE_RETRY_KEY]:{...value,phase:'dispatching',dispatchedBy:actor,dispatchedAt:now}}}).eq('id',row.id).eq('updated_at',scope.updatedAt).eq('execution_status','error_requires_manual_review').select('id').maybeSingle();
  if(reserved.error || !reserved.data)throw Error('Native retry was already consumed or changed');
  const key=process.env.N8N_API_KEY?.trim();if(!key)throw Error('Retry reserved but n8n credentials are unavailable; inspect before dispatching again');
  try {
    const response=await fetch(n8nRecoveryBaseUrl()+`/api/v1/executions/${scope.executionId}/retry`,{method:'POST',headers:{'X-N8N-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({loadWorkflow:true}),redirect:'manual',signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    if(!response.ok)throw Error('Native retry API did not confirm dispatch');
  } catch (error) {
    // n8n may keep the retry request open until completion. Adoption is separate server evidence.
    const current=admission(await physical(Number(row.id)));
    if(current?.phase!=='adopted' || current.sourceClaim.executionId!==scope.executionId)throw Error('Native retry dispatch was not confirmed; inspect workflow history before another action');
  }
  return {dispatchStarted:true,orderId:scope.orderId};
}
function matchesSourceClaim(claim:W2AParentClaim,value:Admission){return same(claim,value.sourceClaim)||same(claim,value.currentClaim);}
async function verifyNativeRoot(value:Admission,id:string):Promise<Row> {
  if(!/^\d{1,30}$/.test(id) || id===value.sourceClaim.executionId)throw Error('Invalid native retry execution');
  const root=record(await readN8NExecution(id));
  if(!root || root.id!==id || root.workflowId!==W2A_ORCHESTRATOR_ID || root.retryOf!==value.sourceClaim.executionId || !['running','new'].includes(String(root.status)) ||
      !same(originalW2AClaim(root),{orderId:value.sourceClaim.orderId,orderRowId:value.sourceClaim.orderRowId,startedAt:value.sourceClaim.startedAt}))throw Error('Native retry lineage is not a current running parent');
  return root;
}
/** Translate only an explicitly admitted native retry. Ordinary claims still use the ordinary guard. */
export async function normalizeNativeW2ARetryInput(input:Row):Promise<Row> {
  const runtimeId=input.workflowNativeParentExecutionId,claim=w2aParentClaimFromInput(input);
  if(!runtimeId || !claim || runtimeId===claim.executionId)return input;
  if(typeof runtimeId!=='string')throw Error('Invalid native parent execution');
  let row=await physical(claim.orderRowId),value=admission(row);
  if(!value || !['dispatching','adopted'].includes(value.phase) || !matchesSourceClaim(claim,value))throw Error('Native retry is not explicitly admitted');
  const root=await verifyNativeRoot(value,runtimeId);
  const n=input.poseNumber;
  if(typeof n!=='number' || !Number.isInteger(n) || n<value.firstPose || !value.jobs.some(j=>j.logical_key===`pose-${String(n).padStart(2,'0')}`))throw Error('Native retry cannot regenerate retained poses');
  const sourceJob=value.jobs.find(j=>j.logical_key===`pose-${String(n).padStart(2,'0')}`)!,snapshot=sourceJob.normalized_input_snapshot ?? {};
  if(input.workflowJobId!==sourceJob.id)throw Error('Native retry job differs from its saved loop');
  for(const key of frozenFields.filter(k=>k!=='orderId'))if(input[key]!==undefined && (n===value.firstPose || snapshot[key]!=null) && !sameFrozen(key,input[key] ?? null,snapshot[key] ?? null))throw Error('Native retry changes frozen input: '+key);
  const canonical={orderId:value.sourceClaim.orderId,rootOrderId:sourceJob.root_order_id ?? sourceJob.amazon_order_id ?? value.sourceClaim.orderId,amazonOrderId:sourceJob.amazon_order_id ?? sourceJob.root_order_id ?? value.sourceClaim.orderId};
  for(const candidate of [input,record(input.orderContext) ?? {}])for(const key of Object.keys(canonical) as (keyof typeof canonical)[])if(candidate[key] && candidate[key]!==canonical[key])throw Error('Native retry changes order identity');
  if(value.phase==='dispatching') {
    if(n!==value.firstPose || input.retryAttempt!==value.sourceInput.retryAttempt || !same(input.qaRetryProof,value.sourceInput.qaRetryProof))throw Error('Only the saved first rejected attempt may adopt the native parent');
    held(row,value.sourceFailure);await currentProofs(value);
    const currentClaim={...value.sourceClaim,executionId:runtimeId,startedAt:claimTime(root.startedAt)!};if(!currentClaim.startedAt)throw Error('Native parent start time is unavailable');
    const now=new Date().toISOString();value={...value,phase:'adopted',currentClaim};
    const updated=await supabase.from('orders').update({execution_status:'processing',current_workflow:'2A',started_at:currentClaim.startedAt,updated_at:now,error_type:null,error_message:null,next_retry_at:null,
      product_info:{...record(row.product_info),[W2A_PARENT_KEY]:currentClaim,[NATIVE_RETRY_KEY]:value,[W2A_FAILURE_KEY]:{...value.sourceFailure,resolvedAt:now,resolvedBy:value.preparedBy}},
    }).eq('id',row.id).eq('updated_at',row.updated_at).eq('execution_status','error_requires_manual_review').is('current_workflow',null).is('started_at',null).select('*').maybeSingle();
    if(updated.error || !updated.data)throw Error('Native retry ownership changed before adoption');row=updated.data;
  }
  const currentClaim=value.currentClaim!;if(currentClaim.executionId!==runtimeId)throw Error('Another native execution owns this retry');assertActiveW2AParentRow(row,currentClaim);
  return {...input,...canonical,workflowParentClaim:currentClaim,orderContext:{...record(input.orderContext),...canonical,workflowParentClaim:currentClaim}};
}
export function allowsNativeQAAdoption(row:Row,job:WorkflowJobRecord,previous:unknown,proof:unknown,current:unknown):boolean {
  const value=admission(row),saved=value?.jobs.find(j=>j.id===job.id);
  return Boolean(value?.phase==='adopted' && value.firstPose===job.normalized_input_snapshot?.poseNumber && saved && same(saved,job) && same(parseW2AParentClaim(previous),value.sourceClaim) && same(parseW2AParentClaim(proof),value.sourceClaim) && same(parseW2AParentClaim(current),value.currentClaim));
}
export async function nativeCompletionClaim(row:Row,claim:W2AParentClaim,runtimeId:unknown):Promise<W2AParentClaim> {
  if(runtimeId===undefined || runtimeId===claim.executionId)return claim;
  const value=admission(row);
  if(!value || value.phase!=='adopted' || typeof runtimeId!=='string' || value.currentClaim?.executionId!==runtimeId || !matchesSourceClaim(claim,value))throw Error('Native completion has no current owner');
  await verifyNativeRoot(value,runtimeId);return value.currentClaim;
}
export function mapNativeRetryFailure(row:Row,root:Row,failure:W2AFailure):W2AFailure {
  const value=admission(row);
  if(value?.phase==='adopted' && value.currentClaim?.executionId===failure.executionId && root.retryOf===value.sourceClaim.executionId && failure.claimStartedAt===value.sourceClaim.startedAt && failure.orderRowId===value.currentClaim.orderRowId && failure.orderId===value.currentClaim.orderId)return {...failure,claimStartedAt:value.currentClaim.startedAt};
  return failure;
}
