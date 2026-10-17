import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-scheduled-test', GELATO_NOTIFICATIONS_ENABLED: 'true' });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('No real network in scheduler proof'); };
  try {
    const { fixture } = await import('./test-gelato-engineering-automation');
    const { pollRegisteredGelatoStatus } = await import('../src/lib/books/gelato-scheduled-status');
    const { GelatoProviderReadError, getGelatoOrder, gelatoRetryAfter } = await import('../src/lib/books/gelato-api-client');
    const { GelatoProviderOrderSchema } = await import('../src/lib/books/gelato-provider-snapshot');
    type Entry = { f: Awaited<ReturnType<typeof fixture>>; due: number; token: string | null; kind: string; result?: Record<string, unknown> };
    const entries = new Map<string, Entry>(), visited: string[] = [];
    let rpcCalls = 0, applies = 0, holds = 0, forbiddenEffects = 0;
    const database = createClient('https://db.example.test', 'synthetic', { global: { fetch: async (input, init) => {
      const r = new Request(input, init), url = new URL(r.url);
      assert.equal(url.origin, 'https://db.example.test'); assert(r.method === 'POST' && url.pathname.includes('/rpc/'));
      rpcCalls++; const name = url.pathname.split('/').pop(), body = await r.json();
      if (name === 'claim_gelato_scheduled_status') {
        assert.match(body.p_account_key_sha256, /^[a-f0-9]{64}$/); assert.equal(body.p_lease_seconds, 30);
        const found = [...entries.entries()].filter(([, e]) => !e.token && e.due <= Date.now()).sort((a, b) => a[1].due - b[1].due)[0];
        if (!found) return Response.json([]);
        found[1].token = randomUUID(); visited.push(found[0]);
        return Response.json([{ submission_id: found[0], lease_token: found[1].token }]);
      }
      const e = entries.get(body.p_submission_id); assert(e && e.token);
      assert.equal(body.p_poll_token, e.token, 'Every write and cleanup uses owned lease token');
      if (name === 'finish_gelato_scheduled_status') {
        assert(!r.signal.aborted, 'Cleanup must have an independent unexpired signal');
        e.result = body; e.token = null; e.due = Date.now() + 60_000; return Response.json(null);
      }
      if (name === 'apply_gelato_scheduled_snapshots') {
        if (e.kind === 'database') return Response.json({ message: 'Synthetic database rejection' }, { status: 503 });
        assert.deepEqual(body.p_notifications, []); assert.deepEqual(body.p_notification_holds, []);
        assert.equal(body.p_results[0].status, 'returned'); assert.equal(body.p_results[0].items[0].status, 'returned');
        applies++; return Response.json(null);
      }
      assert.equal(name, 'hold_gelato_scheduled_refresh', 'No legacy global selector, create, recover, cancel or sender RPC'); holds++; return Response.json(null);
    } } });
    for (let index = 0; index < 7; index++) {
      const f = await fixture('standard', 1, index, true, 'ORDINARY-SCHEDULED');
      f.context.submission.id = randomUUID();
      const root = `scheduled-root-${index}`;
      const before = GelatoProviderOrderSchema.parse({ ...f.raw(), id: root, orderType: 'order', fulfillmentStatus: 'created' });
      Object.assign(f.context.providerOrders[0], { provider_order_id: root, status: 'created', order_type: 'order', snapshot: before });
      f.context.members.forEach(member => { member.submission_id = f.context.submission.id; member.provider_order_id = root; });
      entries.set(f.context.submission.id, { f, due: Date.now() - 10000 + index, token: null, kind: index === 0 ? 'stall' : index === 1 ? 'malformed' : index === 2 ? 'rate' : index === 3 ? 'database' : 'healthy' });
    }
    const options = { enabled: true, apiKey: 'synthetic-status-key', budgetMs: 500, candidateBudgetMs: 40, cleanupBudgetMs: 75,
      lifecycle: (signal: AbortSignal) => ({
        store: { load: async (id: string) => {
          const e = entries.get(id)!;
          if (e.kind === 'stall') return new Promise<never>(() => {});
          if (e.kind === 'malformed') throw Error('Synthetic malformed context');
          return e.f.context;
        }, transition: async () => { forbiddenEffects++; throw Error('Unfenced transition forbidden'); } },
        loadOrder: async () => { forbiddenEffects++; throw Error('Customer loading forbidden'); },
        verifyStoredFile: async () => true,
      }),
    };
    // Exercise the production client's static import graph and HTTP parsing, not a
    // dynamically imported Error constructor with a different tsx module identity.
    globalThis.fetch = async (input, init) => {
      const r = new Request(input, init), url = new URL(r.url);
      assert.equal(url.origin, 'https://order.gelatoapis.com'); assert.equal(r.method, 'GET');
      assert.equal(r.headers.get('x-api-key'), options.apiKey);
      const id = url.pathname.split('/').pop()!;
      const e = [...entries.values()].find(v => v.f.context.providerOrders.some(p => p.provider_order_id === id)); assert(e);
      if (e.kind === 'rate') return new Response(null, { status: 429, headers: { 'Retry-After': '1800' } });
      return Response.json({ ...e.f.raw(), id, orderType: 'order', fulfillmentStatus: 'returned', updatedAt: '2026-10-16T15:00:00Z',
        items: e.f.raw().items.map(item => ({ ...item, fulfillmentStatus: 'returned' })) });
    };
    assert.equal((await pollRegisteredGelatoStatus(database, { ...options, enabled: false })).disabled, true); assert.equal(rpcCalls, 0);
    const watchdog = setTimeout(() => { throw Error('Scheduler exceeded bounded local proof'); }, 2500);
    try {
      const results = [];
      for (let tick = 0; tick < 3; tick++) results.push(await pollRegisteredGelatoStatus(database, options));
      assert.equal(new Set(visited).size, 7); assert.equal(visited.length, 7, 'Failed oldest cannot starve more than two batches');
      assert.equal(results.reduce((sum, r) => sum + r.checked, 0), 7);
      assert.equal(applies, 3); assert.equal(holds, 1); assert.equal(forbiddenEffects, 0);
      const byKind = (kind: string) => [...entries.values()].find(e => e.kind === kind)!.result!;
      assert.equal(byKind('stall').p_error_class, 'timeout'); assert.equal(byKind('malformed').p_result, 'failed');
      assert.equal(byKind('rate').p_error_class, 'rate_limited'); assert.equal(byKind('rate').p_http_status, 429); assert.equal(byKind('rate').p_retry_after_seconds, 1800);
      assert.equal(byKind('database').p_error_class, 'database_failure');
    } finally { clearTimeout(watchdog); }
    assert.equal(gelatoRetryAfter('120'), 120); assert.equal(gelatoRetryAfter('nonsense'), undefined);
    assert.equal(gelatoRetryAfter('2026-10-17T01:01:00Z', Date.parse('2026-10-17T01:00:00Z')), 60);
    await assert.rejects(() => getGelatoOrder('synthetic-root', { apiKey: 'synthetic', fetcher: async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }) }),
      error => error instanceof GelatoProviderReadError && error.classification === 'rate_limited' && error.retryAfterSeconds === 120);
  } finally { globalThis.fetch = original; }
  console.log('PASS: registered scheduler seven-job progress, timeout cleanup, malformed oldest, Retry-After, skipped returned snapshots, fenced writes, zero notification/network effects');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
