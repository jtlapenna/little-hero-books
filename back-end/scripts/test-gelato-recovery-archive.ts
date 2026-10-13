import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
  process.env.CRON_SECRET = 'synthetic-cron';
  process.env.N8N_HEALTH_MONITOR_WEBHOOK_URL = 'https://workflow.example.test/health';
  const originalFetch = globalThis.fetch;
  let failedCompensation = false;
  let sourceDeleteFails = true;
  let archiveId = 2;
  const archiveRows = new Set([1]);
  let sourceDeletes = 0;
  let genericWrites = 0;
  let held = true;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(url.origin, 'https://db.example.test');
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/rest/v1/archived_orders') {
      if (init?.method === 'POST') { archiveRows.add(archiveId); return json({ id: archiveId }); }
      if (init?.method === 'DELETE') {
        assert.equal(url.searchParams.get('id'), `eq.${archiveId}`);
        assert.equal(url.searchParams.has('order_id'), false);
        if (failedCompensation) return json({ message: 'Synthetic compensation failure' }, 400);
        archiveRows.delete(archiveId); return json([]);
      }
    }
    if (url.pathname === '/rest/v1/orders') {
      if (init?.method === 'DELETE') {
        sourceDeletes++;
        assert.equal(url.searchParams.get('id'), 'eq.71');
        assert.equal(url.searchParams.has('amazon_order_id'), false);
        return sourceDeleteFails ? json({ message: 'Cannot delete an unresolved Gelato print item' }, 400) : json([{ id: 71 }]);
      }
      if (init?.method === 'PATCH') { genericWrites++; return json({ message: 'Synthetic ownership rejection' }, 400); }
      if (url.searchParams.get('print_provider') === 'eq.gelato') return json(held ? [{ id: 71 }] : []);
      return json([{ id: 71, orderId: 'SYNTHETIC-71', amazon_order_id: 'ROOT-71', execution_status: 'processing', retry_count: 0 }]);
    }
    if (url.pathname === '/rest/v1/rpc/get_orphaned_orders') return json([{ id: 71, orderId: 'SYNTHETIC-71', minutes_orphaned: 90, execution_status: 'processing' }]);
    // Watchdog queries receive no jobs or alerts in this synthetic fixture.
    return json([]);
  };
  try {
    const { supabase } = await import('../src/lib/supabase-client');
    const { archiveOrder } = await import('../src/lib/order-lifecycle');
    const order = { id: 71, orderId: 'SYNTHETIC-71', amazon_order_id: 'ROOT-71', platform: 'd2c' };
    await assert.rejects(archiveOrder(supabase, order, 'manual'), /Delete from orders failed/);
    assert.deepEqual([...archiveRows], [1]);
    failedCompensation = true;
    await assert.rejects(archiveOrder(supabase, order, 'manual'), /compensation failed/);
    assert.deepEqual([...archiveRows], [1, 2]);
    failedCompensation = false; sourceDeleteFails = false; archiveId = 3;
    await archiveOrder(supabase, order, 'manual');
    assert.deepEqual([...archiveRows], [1, 2, 3]); assert.equal(sourceDeletes, 3);
    const recovery = await import('../src/app/api/admin/orphaned-orders/route');
    const list = await recovery.GET(new NextRequest('https://admin.example.test/api/admin/orphaned-orders'));
    assert.equal((await list.json()).count, 0);
    for (const action of ['schedule_retry', 'manual_review', 'reset_processing']) {
      const response = await recovery.POST(new NextRequest('https://admin.example.test/api/admin/orphaned-orders', {
        method: 'POST', body: JSON.stringify({ orderIds: [71], action }), headers: { 'Content-Type': 'application/json' },
      }));
      assert.equal(response.status, 409);
    }
    assert.equal(genericWrites, 0);
    const health = await import('../src/app/api/cron/health-monitor/route');
    const response = await health.GET(new NextRequest('https://admin.example.test/api/cron/health-monitor', { headers: { Authorization: 'Bearer synthetic-cron' } }));
    assert.equal(response.status, 200); assert.equal((await response.json()).reason, 'no_work');
    assert.equal(calls.some((path) => path.includes('workflow.example')), false);
    held = false;
    const rejected = await recovery.POST(new NextRequest('https://admin.example.test/api/admin/orphaned-orders', {
      method: 'POST', body: JSON.stringify({ orderIds: [71], action: 'reset_processing' }), headers: { 'Content-Type': 'application/json' },
    }));
    assert.equal(rejected.status, 500, 'Race rejection must not be reported as recovered');
  } finally { globalThis.fetch = originalFetch; }
  console.log('Gelato recovery and exact archive compensation regressions passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
