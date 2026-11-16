import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NextRequest } from 'next/server';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://attempt-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-attempt-key', BACKEND_API_TOKEN: 'synthetic-attempt-token' });
  let job = {} as Record<string, unknown>;
  let attempts: Record<string, unknown>[] = [];
  let row = {} as Record<string, unknown>;
  let race = false, events = 0, jobWrites = 0, providerCalls = 0;
  const transport = global.fetch;
  global.fetch = async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    if (url.hostname !== 'attempt-db.example.test') { providerCalls++; throw Error('Nonfixture network forbidden'); }
    const table = url.pathname.split('/').pop();
    const patch = req.method === 'GET' ? {} : await req.json() as Record<string, unknown>;
    const filters = [...url.searchParams].filter(([key]) => !['select','order','limit'].includes(key));
    const matches = (record: Record<string, unknown>) => filters.every(([key, expr]) => expr.startsWith('eq.') && String(record[key]) === expr.slice(3));
    if (table === 'workflow_job_events') { events++; return Response.json({ id: events, ...patch }); }
    const rows = table === 'orders' ? [row] : table === 'workflow_jobs' ? [job] : attempts;
    if (req.method === 'POST') { const added = { id: 200 + attempts.length, ...patch }; attempts.push(added); return Response.json(added); }
    if (table === 'workflow_jobs' && req.method === 'PATCH' && race) {
      race = false; Object.assign(job, { attempt_count: 2, status: 'running', lease_owner: 'new-attempt', result_snapshot: {} });
    }
    const found = rows.find(matches);
    if (req.method === 'PATCH' && found) { Object.assign(found, patch); if (table === 'workflow_jobs') { jobWrites++; job.updated_at = String(Number(job.updated_at) + 1); } }
    return Response.json(req.headers.get('accept')?.includes('object') ? found ?? null : found ? [found] : []);
  };
  try {
    const { POST } = await import('../src/app/api/internal/workflow-jobs/log-event/route');
    const { claimAndStartW2APoseJob } = await import('../src/lib/workflow-jobs/w2a-pose-jobs');
    const { claimRejectedW2APoseJob } = await import('../src/lib/workflow-jobs/repository');
    const startedAt = '2026-11-16T05:00:00.000000Z';
    const claim = { orderRowId: 4, orderId: 'ATTEMPT-BOOK', startedAt, executionId: '4242' };
    const initialInput = { orderId: claim.orderId, bookId: 'book-finding-our-inner-voice', formatId: 'amazon', poseNumber: 0,
      poseIdentityContract: 'configured-recipe@v1', characterHash: 'fixture-hash', workflowParentClaim: claim, retryAttempt: 0,
      baseCharacterKey: 'base.png', poseRefKey: 'pose.png', oneManifestUrl: 'book-finding-our-inner-voice/orders/ATTEMPT-BOOK/manifests/1-manifest.json', workflowJobId: 11 };
    const reset = () => {
      row = { id: 4, orderId: claim.orderId, execution_status: 'processing', current_workflow: '2A', started_at: startedAt };
      job = { id: 11, order_id: claim.orderId, book_id: initialInput.bookId, stage: '2a', job_type: 'w2a-single-pose', logical_key: 'pose-00', idempotency_key: 'fixture-key',
        status: 'succeeded', attempt_count: 1, updated_at: '1', lease_owner: null, normalized_input_snapshot: initialInput,
        result_snapshot: { uploadKey: 'original.png', generatedFileName: 'original.png' } };
      attempts = [{ id: 101, job_id: 11, attempt: 1, status: 'succeeded', started_at: '2026-11-16T05:01:00Z', ended_at: '2026-11-16T05:01:03Z' }];
      jobWrites = 0;
    };
    reset();
    const proof = { schema: 'lhb.w2a-qa-rejection@1', jobId: 11, attemptId: 101, attempt: 1, retryAttempt: 0, uploadKey: 'original.png', generatedFileName: 'original.png', workflowParentClaim: claim };
    const retry = { ...initialInput, retryAttempt: 1, uploadKey: 'retry.png', generatedFileName: 'retry.png', qaRetryProof: proof };
    for (const input of [ { ...retry, qaRetryProof: null }, { ...retry, retryAttempt: 4 }, { ...retry, characterHash: 'changed' },
      { ...retry, qaRetryProof: { ...proof, attemptId: 999 } }, { ...retry, qaRetryProof: { ...proof, uploadKey: 'wrong.png' } }, { ...retry, workflowJobId: 999 } ]) {
      await assert.rejects(() => claimAndStartW2APoseJob(input as never)); assert.equal(jobWrites, 0);
    }
    row.execution_status = 'error'; await assert.rejects(() => claimAndStartW2APoseJob(retry as never)); assert.equal(jobWrites, 0); row.execution_status = 'processing';
    // Execute the actual QA producer, then the real repository/HTTP consumer.
    const top = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json', 'utf8'));
    const code = top.nodes.find((n: { name: string }) => n.name.includes('QA Handoff')).parameters.jsCode;
    const produced = vm.runInNewContext(`(function(){${code}})()`, { $json: { ...initialInput, workflowAttemptId: 101, workflowAttempt: 1, uploadKey: 'original.png', generatedFileName: 'original.png', qa: { combined: { pass: false } } }, $binary: {}, $execution: { customData: {} }, global: {} }).json;
    assert.deepEqual(JSON.parse(JSON.stringify(produced.qaRetryProof)), proof);
    const accepted = await claimAndStartW2APoseJob({ ...retry, qaRetryProof: produced.qaRetryProof } as never);
    assert.equal(accepted.workflowClaimed, true); assert.equal(accepted.workflowAttempt, 2); assert.ok(accepted.workflowAttemptId); assert.equal(job.attempt_count, 2); assert.equal(job.status, 'running');
    const lease = job.lease_owner;
    const send = async (attemptId: number | null, status: string) => {
      const res = await POST(new NextRequest('https://admin.littleherolabs.com/api/internal/workflow-jobs/log-event', { method: 'POST', headers: { authorization: 'Bearer synthetic-attempt-token', 'content-type': 'application/json' }, body: JSON.stringify({ jobId: 11, attemptId, eventType: 'late', jobStatus: status, attemptStatus: status, resultSnapshot: { stale: true } }) }));
      assert.equal(res.status, 200); return res.json();
    };
    for (const status of ['succeeded','failed']) { assert.equal((await send(101,status)).historyOnly,true); assert.equal(job.lease_owner, lease); assert.equal(job.status,'running'); }
    assert.equal((await send(null,'succeeded')).historyOnly,true); assert.equal(job.status,'running');
    assert.equal((await send(accepted.workflowAttemptId,'succeeded')).historyOnly,false); assert.equal(job.status,'succeeded');
    const jobOnly = await POST(new NextRequest('https://admin.littleherolabs.com/api/internal/workflow-jobs/log-event', {method:'POST',headers:{authorization:'Bearer synthetic-attempt-token','content-type':'application/json'},body:JSON.stringify({jobId:11,attemptId:accepted.workflowAttemptId,eventType:'late-job-only',jobStatus:'failed'})}));
    assert.equal((await jobOnly.json()).historyOnly,true); assert.equal(job.status,'succeeded');
    await assert.rejects(() => claimAndStartW2APoseJob(retry as never));
    reset();
    const snapshot = structuredClone(job);
    const winners = await Promise.all([claimRejectedW2APoseJob(snapshot as never,{leaseOwner:'one'}),claimRejectedW2APoseJob(snapshot as never,{leaseOwner:'two'})]);
    assert.equal(winners.filter(Boolean).length,1); assert.equal(job.attempt_count,2);
    reset(); job.status = 'running'; attempts[0].status = 'running'; attempts[0].ended_at = null;
    race = true; await send(101,'succeeded'); assert.equal(job.attempt_count,2); assert.equal(job.status,'running'); assert.equal(job.lease_owner,'new-attempt');
    assert.equal(providerCalls,0); assert.ok(events>=5);
    console.log('Actual QA handoff → retry CAS → persisted attempt and callback transport fences passed; zero provider calls.');
  } finally { global.fetch = transport; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
