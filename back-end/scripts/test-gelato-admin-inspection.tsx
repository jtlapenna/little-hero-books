import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import type { GelatoPrintInspection } from '../src/lib/books/gelato-admin-inspection';
import { GelatoObservationDetails } from '../src/components/stages/gelato-observation-details';

async function main() {
  const adminToken = 'synthetic-admin-token-at-least-thirty-two-bytes';
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-admin-proof', BACKEND_API_TOKEN: adminToken, GELATO_SCHEDULED_STATUS_ENABLED: 'true' });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('No real network'); };
  try {
    const { fixture } = await import('./test-gelato-engineering-automation');
    const { getGelatoOrder } = await import('../src/lib/books/gelato-api-client');
    const f = await fixture('amazon', 2, 98, false, 'ORDINARY-ADMIN', true);
    const observed = await getGelatoOrder(f.a.provider_root_id, { apiKey: 'synthetic', fetcher: async () => Response.json({ ...f.raw(), financialStatus: 'pending',
      receipts: [{ id: 'synthetic-receipt', currency: 'USD', isCalculated: true, total: 0, privateBilling: 'PRIVATE-RECEIPT' }] }) });
    Object.assign(f.context.providerOrders[0], { last_checked_at: '2026-10-16T13:00:00Z', financial_observation: { ...observed.financialObservation, private: 'PRIVATE-OBSERVATION' }, financial_observed_at: '2026-10-16T13:00:00Z', observation_revision: 1 });
    let calls = 0;
    const job = { enabled: true, registered_at: '2000-01-01T00:00:00Z', last_attempt_at: '2000-01-03T00:00:00Z', last_success_at: '2000-01-02T00:00:00Z',
      next_attempt_at: '2000-01-04T00:00:00Z', last_result: 'failed', last_error_class: 'timeout', active_interval_seconds: 300, terminal_interval_seconds: 3600, terminal_until: null,
      account_key_sha256: 'PRIVATE-KEY-HASH', lease_token: 'PRIVATE-LEASE' };
    globalThis.fetch = async (input, init) => {
      const r = new Request(input, init), url = new URL(r.url); calls++;
      assert.equal(url.origin, 'https://db.example.test'); assert.equal(r.method, 'GET', 'Admin inspection must not refresh or mutate anything');
      const table = url.pathname.split('/').pop();
      let rows: unknown[];
      if (table === 'orders') { rows = [...f.rows.values()]; const key = url.searchParams.get('orderId'); if (key?.startsWith('eq.')) rows = rows.filter(row => (row as Record<string, unknown>).orderId === key.slice(3)); }
      else if (table === 'print_provider_submissions') rows = [f.context.submission];
      else if (table === 'print_provider_submission_orders') rows = f.context.providerOrders;
      else if (table === 'print_provider_submission_items') rows = f.context.members;
      else if (table === 'print_provider_submission_notifications') rows = [];
      else { assert.equal(table, 'gelato_scheduled_status'); rows = [job]; }
      return Response.json(r.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    };
    const { GET } = await import('../src/app/api/admin/gelato-print/route');
    const target = 'https://admin.example.test/api/admin/gelato-print?orderId=' + encodeURIComponent(f.context.members[0].child_order_key);
    assert.equal((await GET(new NextRequest(target, { headers: { host: 'admin.example.test', origin: 'https://admin.example.test' } }))).status, 401);
    assert.equal(calls, 0, 'Spoofed same-origin headers cannot inspect financial data');
    const response = await GET(new NextRequest(target, { headers: { authorization: 'Bearer ' + adminToken } }));
    assert.equal(response.status, 200); const data = await response.json() as GelatoPrintInspection;
    assert(calls > 0); assert.equal(data.polling?.stale, true); assert.equal(data.orders[0].lastCheckedAt, '2026-10-16T13:00:00Z');
    assert.equal(data.orders[0].financial?.receipts?.[0].amounts.total, '0'); assert(!JSON.stringify(data).includes('PRIVATE-'));
    const html = renderToStaticMarkup(<GelatoObservationDetails details={data} />);
    for (const text of ['Payment status: pending', 'USD 12.18', 'USD 5', 'USD 0', 'Calculated estimate', 'Status checks are overdue', 'Failed; last known status retained', 'does not confirm a settled charge']) assert(html.includes(text), text);
    const unknown = renderToStaticMarkup(<GelatoObservationDetails details={{ ...data, monetaryQuote: null, polling: null, orders: data.orders.map(order => ({ ...order, financial: null, financialObservedAt: null })) }} />);
    assert(unknown.includes('Payment status: Not recorded')); assert(unknown.includes('Original monetary quote was not retained')); assert(!unknown.includes('USD 0'));
    if (process.env.GELATO_UI_REVIEW_OUTPUT) {
      const fs = await import('node:fs/promises');
      await fs.writeFile(process.env.GELATO_UI_REVIEW_OUTPUT, '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gelato synthetic status review</title><body><main style="max-width:760px;margin:32px auto;padding:20px;font-family:system-ui;line-height:1.5">'+html+'</main></body></html>');
    }
  } finally { globalThis.fetch = original; }
  console.log('PASS: actual financial API producer -> stored schema -> authenticated read-only admin inspection -> rendered costs/freshness; legacy/unknown and privacy cases');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
