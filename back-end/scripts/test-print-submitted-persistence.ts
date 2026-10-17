import assert from 'node:assert/strict';
async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-exact-row' });
  const original = globalThis.fetch;
  let rows: Record<string, unknown>[] = [], writes: number[] = [], noMatch = false;
  globalThis.fetch = async (input, init) => {
    const r = new Request(input, init), url = new URL(r.url);
    assert.equal(url.origin, 'https://db.example.test', 'No external service allowed');
    assert(url.pathname.endsWith('/orders'));
    let selected = rows.filter(row => [...url.searchParams].every(([key, filter]) => {
      if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
      if (filter.startsWith('is.null')) return row[key] == null;
      if (filter.startsWith('ilike.')) return String(row[key] ?? '').startsWith(filter.slice(6).replace(/%$/, ''));
      return true;
    }));
    if (r.method === 'PATCH') {
      if (noMatch) selected = [];
      const patch = await r.json(); for (const row of selected) { writes.push(Number(row.id)); Object.assign(row, patch); }
    } else assert.equal(r.method, 'GET');
    return Response.json(r.headers.get('accept')?.includes('vnd.pgrst.object') ? selected[0] ?? null : selected);
  };
  try {
    const { handlePrintSubmitted } = await import('../src/app/api/webhooks/print-submitted/route');
    const { getOrderFromSupabase } = await import('../src/lib/supabase-client');
    const { persistLuluPrintCompletion } = await import('../src/lib/lulu-print-completion');
    const effects: string[] = [];
    const dependencies: NonNullable<Parameters<typeof handlePrintSubmitted>[1]> = { getOrder: getOrderFromSupabase, persistCompletion: persistLuluPrintCompletion,
      getActivePreviewToken: async orderId => { effects.push('token'); return { token: 'synthetic', orderId, expiresAt: '2999-01-01T00:00:00Z' }; }, getPreviewTokenForOrderLink: async () => null,
      sendD2CPrintSubmittedEmail: async () => { effects.push('email'); return { success: true }; }, sendAmazonPrintSubmittedMessage: async () => { effects.push('amazon'); return { success: true }; },
      recordWorkflowJobEvent: async () => { effects.push('event'); return { success: true, jobId: 1, attemptId: null, currentStatus: 'succeeded' }; },
      completeW4PrintJobForOrder: async () => { effects.push('complete'); return { job: null, attempt: null }; }, completeW4SiblingJobForGroup: async () => { effects.push('siblings'); return { job: null, attempt: null }; },
    };
    const lulu = { id: 101, orderId: 'lulu-child', print_provider: 'lulu', lulu_job_id: 'lulu-1', lulu_status: 'CREATED', updated_at: '2026-10-17T00:00:00Z',
      platform: 'd2c', customer_email: 'synthetic@example.test', has_flags: true, flags: { total: 1, postPdf: 1 } };
    rows = [{ ...lulu }, { id: 202, orderId: '101', print_provider: 'gelato', print_submission_id: 'synthetic-submission' }];
    const protectedBefore = JSON.stringify(rows[1]);
    // Reject lookup aliases before downstream workflow/token helpers can interpret
    // them as another canonical order. Old canonical {orderId}-only bodies still work.
    assert.equal((await handlePrintSubmitted({ orderId: '101' }, dependencies)).status, 409);
    assert.deepEqual(writes, []); assert.deepEqual(effects, []);
    assert.equal((await handlePrintSubmitted({ orderId: 'lulu-child' }, dependencies)).status, 200);
    assert.deepEqual(writes, [101]); assert.equal(JSON.stringify(rows[1]), protectedBefore);
    assert.equal(rows[0].status, 'revision_assembly', 'Preserve canonical flag/revision precedence');
    assert.deepEqual(effects, ['complete', 'token', 'email']);
    rows = [{ ...lulu, orderId: 'prefix-child' }]; writes = []; effects.length = 0;
    assert.equal((await handlePrintSubmitted({ orderId: 'prefix' }, dependencies)).status, 409);
    assert.deepEqual(writes, []); assert.deepEqual(effects, []);
    rows = [{ ...lulu }]; writes = []; effects.length = 0; noMatch = true;
    assert.equal((await handlePrintSubmitted({ orderId: 'lulu-child' }, dependencies)).status, 503);
    assert.deepEqual(writes, []); assert.deepEqual(effects, []);
  } finally { globalThis.fetch = original; }
  console.log('PASS: actual callback lookup -> conditional exact-row write; numeric collision, prefix, legacy body, zero-row failure and flag precedence; fake sender only');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
