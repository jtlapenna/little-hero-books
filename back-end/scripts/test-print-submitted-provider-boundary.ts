import assert from 'node:assert/strict';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-callback-test',
    GELATO_NOTIFICATIONS_ENABLED: 'false', AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED: 'true' });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Callback test must not access any network'); };
  try {
    const { handlePrintSubmitted } = await import('../src/app/api/webhooks/print-submitted/route');
    type Dependencies = NonNullable<Parameters<typeof handlePrintSubmitted>[1]>;
    const calls: string[] = [];
    let rows: Record<string, unknown>[] = [], failWrite = false;
    const dependencies: Dependencies = {
      getOrder: async id => rows.find(row => row.orderId === id) ?? null,
      persistCompletion: async () => { calls.push('write'); if (failWrite) throw Error('synthetic write failure'); },
      getActivePreviewToken: async orderId => { calls.push('token'); return { token: 'synthetic-token', orderId, expiresAt: '2999-01-01T00:00:00Z' }; },
      getPreviewTokenForOrderLink: async () => { calls.push('fallback-token'); return null; },
      sendAmazonPrintSubmittedMessage: async () => { calls.push('amazon-send'); return { success: true }; },
      sendD2CPrintSubmittedEmail: async () => { calls.push('email-send'); return { success: true }; },
      recordWorkflowJobEvent: async () => { calls.push('event'); return { success: true, jobId: 1, attemptId: null, currentStatus: 'succeeded' }; },
      completeW4PrintJobForOrder: async () => { calls.push('complete'); return { job: null, attempt: null }; },
      completeW4SiblingJobForGroup: async () => { calls.push('complete-siblings'); return { job: null, attempt: null }; },
    };
    const lulu = (id: string, platform = 'd2c') => ({ orderId: id, print_provider: 'lulu', lulu_job_id: 'synthetic-lulu', lulu_status: 'CREATED', platform,
      amazon_order_id: '111-2222222-3333333', customer_email: 'synthetic@example.test' });
    const payload = (ids: string[], mode = 'production') => ({ orderIds: ids, submitMode: mode, luluJobId: 'synthetic-lulu', luluStatus: 'CREATED' });
    for (const platform of ['d2c', 'amazon']) for (const mode of ['production', 'sandbox']) {
      for (const provider of ['gelato', 'unknown']) {
        calls.length = 0;
        rows = [{ ...lulu('child', platform), print_provider: provider, gelato_order_type: 'draft' }];
        const result = await handlePrintSubmitted(payload(['child'], mode), dependencies);
        assert.equal(result.status, 409, `${platform}/${mode}/${provider}`);
        assert.deepEqual(calls, [], 'Reject before workflow, status, token or sender side effects');
      }
      calls.length = 0;
      rows = [lulu('first', platform), { ...lulu('second', platform), print_provider: 'gelato' }];
      assert.equal((await handlePrintSubmitted(payload(['first', 'second'], mode), dependencies)).status, 409);
      assert.deepEqual(calls, [], 'A later Gelato sibling must prevent partial completion of the first');
    }
    for (const evidence of [{ gelato_order_id: 'stale-root' }, { print_submission_id: 'stale-submission' }, { gelato_status: 'draft' }]) {
      calls.length = 0; rows = [{ ...lulu('child'), ...evidence }];
      assert.equal((await handlePrintSubmitted(payload(['child']), dependencies)).status, 409);
      assert.deepEqual(calls, [], 'Persisted conflicting ownership must fail closed');
    }
    calls.length = 0; rows = [lulu('first')];
    assert.equal((await handlePrintSubmitted(payload(['first', 'missing']), dependencies)).status, 404);
    assert.deepEqual(calls, [], 'Resolve the complete group before any effects');
    calls.length = 0; rows = [lulu('child')]; failWrite = true;
    assert.equal((await handlePrintSubmitted(payload(['child']), dependencies)).status, 503);
    assert.deepEqual(calls, ['write'], 'A failed status write cannot complete work or attempt a send');
    failWrite = false;
    calls.length = 0;
    assert.equal((await handlePrintSubmitted({ ...payload(['child']), luluJobId: 'wrong-job' }, dependencies)).status, 409);
    assert.deepEqual(calls, [], 'A different persisted Lulu job must not be overwritten');
    for (const platform of ['d2c', 'amazon']) {
      calls.length = 0; rows = [lulu('child', platform)];
      assert.equal((await handlePrintSubmitted(payload(['child']), dependencies)).status, 200);
      assert.deepEqual(calls, ['write', 'complete', 'token', platform === 'd2c' ? 'email-send' : 'amazon-send']);
    }
    calls.length = 0; rows = [{ ...lulu('child'), print_provider: null }];
    assert.equal((await handlePrintSubmitted(payload(['child'], 'sandbox'), dependencies)).status, 200);
    assert.deepEqual(calls, ['complete'], 'Unambiguous persisted legacy Lulu ownership remains supported');
  } finally { globalThis.fetch = original; }
  console.log('PASS: legacy callback provider/group boundary, failed-write no-send, valid Lulu adapters only; zero network');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
