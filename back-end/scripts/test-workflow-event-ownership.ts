import assert from 'node:assert/strict';
import { recordWorkflowJobEventResponse } from '../src/app/api/internal/workflow-jobs/log-event/route';

async function main() {
  const job = { id: 11, idempotency_key: 'job-a', status: 'running' };
  const otherJob = { id: 12, idempotency_key: 'job-b', status: 'running' };
  const writes: string[] = [];
  const dependencies = {
    getWorkflowJobById: async (id: number) => id === 11 ? job : id === 12 ? otherJob : null,
    getWorkflowJobByIdempotencyKey: async (key: string) => key === 'job-a' ? job : key === 'job-b' ? otherJob : null,
    getWorkflowJobAttemptById: async (id: number) => id === 101 ? { id, job_id: 11, status: 'running', ended_at: null } : id === 102 ? { id, job_id: 12, status: 'running', ended_at: null } : null,
    finishWorkflowJobAttempt: async () => { writes.push('finish attempt'); return null; },
    updateWorkflowJobAttempt: async () => { writes.push('update attempt'); return null; },
    markWorkflowJobRunning: async () => { writes.push('running'); return null; },
    markWorkflowJobPolling: async () => { writes.push('polling'); return null; },
    markWorkflowJobSucceeded: async () => { writes.push('succeeded'); return null; },
    markWorkflowJobFailed: async () => { writes.push('failed'); return null; },
    scheduleWorkflowJobRetry: async () => { writes.push('retry'); return null; },
    deadLetterWorkflowJob: async () => { writes.push('dead letter'); return null; },
    appendWorkflowJobEvent: async () => { writes.push('append'); return null; },
  } as unknown as Parameters<typeof recordWorkflowJobEventResponse>[1];
  const base = { jobId: 11, eventType: 'completed', jobStatus: 'succeeded', attemptStatus: 'succeeded' };
  const failures: string[] = [];
  for (const [label, payload] of [
    ['other-job attempt', { ...base, attemptId: 102 }],
    ['missing attempt', { ...base, attemptId: 999 }],
    ['other-job polling attempt', { jobId: 11, eventType: 'poll', jobStatus: 'polling', attemptStatus: 'polling', attemptId: 102 }],
    ['missing polling attempt', { jobId: 11, eventType: 'poll', jobStatus: 'polling', attemptStatus: 'polling', attemptId: 999 }],
    ['other-job attempt with no status', { jobId: 11, eventType: 'observe', attemptId: 102 }],
    ['missing attempt with no status', { jobId: 11, eventType: 'observe', attemptId: 999 }],
    ['conflicting job key', { ...base, attemptId: 101, idempotencyKey: 'job-b' }],
    ['unknown job key', { ...base, attemptId: 101, idempotencyKey: 'not-found' }],
    ['unknown job id', { ...base, jobId: 999, attemptId: 101, idempotencyKey: 'job-a' }],
  ] as const) {
    writes.length = 0;
    let rejected = false;
    try { await recordWorkflowJobEventResponse(payload, dependencies); } catch { rejected = true; }
    if (!rejected || writes.length) failures.push(`${label}: rejected=${rejected}, writes=${writes.join(',') || 'none'}`);
  }
  if (failures.length) throw new Error(`Ownership failures:\n${failures.join('\n')}`);
  writes.length = 0;
  await recordWorkflowJobEventResponse({ ...base, attemptId: 101, idempotencyKey: 'job-a' }, dependencies);
  assert.deepEqual(writes, ['finish attempt', 'succeeded', 'append']);
  writes.length = 0;
  await recordWorkflowJobEventResponse({ jobId: 11, eventType: 'legacy', jobStatus: 'polling' }, dependencies);
  assert.deepEqual(writes, ['polling', 'append']);
  writes.length = 0;
  await recordWorkflowJobEventResponse({ idempotencyKey: 'job-a', attemptId: 101, eventType: 'matched', attemptStatus: 'polling' }, dependencies);
  assert.deepEqual(writes, ['update attempt', 'append']);
  console.log('Workflow event job and attempt ownership checks passed; missing attempt ID remains allowed for legacy events.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
