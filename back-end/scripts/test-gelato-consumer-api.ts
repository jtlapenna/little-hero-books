import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { gelatoCustomerStatusMessage } from '../src/lib/books/gelato-consumer-status';
import { NextRequest } from 'next/server';

async function main() {
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-consumer-proof';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3117';
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let rows: Record<string, unknown>[] = [];
  let archived: Record<string, unknown>[] = [];
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'db.example.test', 'only synthetic database transport allowed');
    if ((init?.method ?? 'GET') !== 'GET') { writes++; throw new Error('Guarded request attempted mutation'); }
    const source = url.pathname.endsWith('/archived_orders') ? archived : rows;
    let data = source;
    for (const [column, filter] of url.searchParams) {
      if (!['id', 'orderId', 'order_id', 'root_order_id', 'amazon_order_id'].includes(column)) continue;
      if (filter.startsWith('eq.')) data = data.filter((row) => String(row[column] ?? '') === filter.slice(3));
      if (filter.startsWith('ilike.')) data = data.filter((row) => String(row[column] ?? '').startsWith(filter.slice(6).replace(/%$/, '')));
    }
    const headers = new Headers(init?.headers);
    const body = headers.get('Accept')?.includes('vnd.pgrst.object') ? data[0] ?? null : data;
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  console.error = () => undefined;
  try {
    const { POST: print } = await import('../src/app/api/orders/[orderId]/print/route');
    const { GET: customerStatus } = await import('../src/app/api/preview/[orderId]/status/route');
    const { POST: regenerate } = await import('../src/app/api/admin/orders/[orderId]/regenerate-4/route');
    const root = '111-2222222-3333333';
    const fresh = () => [1, 2].map((id) => ({ id, orderId: `${root}-item-${id}`, root_order_id: root, platform: 'amazon', print_provider: 'gelato' }));
    const request = (path: string) => new NextRequest(`http://localhost:3117${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3117' }, body: '{}' });
    for (const scenario of ['selected', 'mixed', 'sibling-submission', 'sibling-provider-order']) {
      rows = fresh();
      if (scenario === 'selected') rows[0].print_submission_id = 'existing';
      if (scenario === 'mixed') rows[1].print_provider = 'lulu';
      if (scenario === 'sibling-submission') rows[1].print_submission_id = 'existing';
      if (scenario === 'sibling-provider-order') rows[1].gelato_order_id = 'existing';
      const response = await print(request('/api/orders/print'), { params: Promise.resolve({ orderId: `${root}-item-1` }) });
      assert.equal(response.ok, false, scenario);
      const body = await response.json();
      assert.match(typeof body.error === 'string' ? body.error : body.error.message, scenario === 'mixed' ? /different print providers/ : /Existing Gelato submission/, scenario);
      assert.equal(writes, 0, 'print guard must reject before shipping hydration or queue mutation');
    }
    rows = fresh(); rows[0].print_submission_id = 'existing';
    assert.equal((await regenerate(request('/api/admin/regenerate-4'), { params: Promise.resolve({ orderId: `${root}-item-1` }) })).status, 409);
    archived = [{ id: 700, order_data: rows[0] }]; rows = [];
    assert.equal((await regenerate(request('/api/admin/regenerate-4'), { params: Promise.resolve({ orderId: `${root}-item-1` }) })).status, 409);
    assert.equal(writes, 0, 'archive restore must reject before inserting or deleting');
    const customerFixtures: Record<string, unknown> = {};
    for (const status of ['draft', 'in_production', 'shipped', 'delivered', 'canceled', 'returned']) {
      const type = status === 'draft' ? 'draft' : 'order';
      const packages = status === 'shipped' || status === 'delivered' ? [1, 2].map((id) => ({ providerOrderId: 'synthetic-provider', packageId: `package-${id}`, providerItemIds: ['synthetic-item'], trackingNumber: `tracking-${id}`, trackingUrl: `https://tracking.example.test/${id}`, carrier: 'USPS', quantity: 1 })) : [];
      rows = [{ ...fresh()[0], gelato_status: status, gelato_order_type: type, gelato_tracking: packages, customer_approval_status: 'approved', character_specs: { childName: 'Test Child' } }];
      const response = await customerStatus(new NextRequest(`http://localhost:3117/api/preview/${root}-item-1/status`), { params: Promise.resolve({ orderId: `${root}-item-1` }) });
      assert.equal(response.status, 200, status);
      const body = await response.json();
      const expected = gelatoCustomerStatusMessage(status, type);
      assert.equal(body.status, expected.short, status); assert.equal(body.statusLong, expected.long, status);
      assert.equal(body.luluStatus, null); assert.equal(body.printProvider, 'gelato');
      if (packages.length > 1) { assert.equal(body.packages.length, 2); assert.equal(body.trackingNumber, null); }
      customerFixtures[status] = body;
    }
    if (process.env.GELATO_UI_FIXTURE_OUTPUT) writeFileSync(process.env.GELATO_UI_FIXTURE_OUTPUT, JSON.stringify(customerFixtures));

  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
  console.log('Gelato actual print/regenerate API guards: no mutations');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
