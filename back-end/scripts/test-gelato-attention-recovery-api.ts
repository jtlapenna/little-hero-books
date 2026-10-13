import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-attention-proof';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3117';

  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let selectedRows: Record<string, unknown>[] = [];
  let mutationMode: 'success' | 'error' | 'zero-rows' | 'became-gelato' = 'success';
  let writes = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'db.example.test', 'only synthetic database transport allowed');
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return new Response(JSON.stringify(selectedRows), { headers: { 'Content-Type': 'application/json' } });
    }
    writes++;
    assert.equal(url.searchParams.get('or'), '(print_provider.is.null,print_provider.eq.lulu)', 'mutation rechecks provider atomically');
    if (mutationMode === 'error') {
      return new Response(JSON.stringify({ code: 'XX000', message: 'synthetic update failure' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const updated = ['zero-rows', 'became-gelato'].includes(mutationMode) ? [] : selectedRows.map(({ id }) => ({ id }));
    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  };
  console.error = () => undefined;

  try {
    const { POST } = await import('../src/app/api/admin/orders-needing-attention/route');
    const actions = ['schedule_retry', 'manual_review', 'reset_processing'] as const;
    const request = (action: string) => new NextRequest('http://localhost:3117/api/admin/orders-needing-attention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3117' },
      body: JSON.stringify({ orderIds: [1], action }),
    });

    for (const action of actions) {
      selectedRows = [{ id: 1, orderId: 'synthetic-order', print_provider: 'gelato', retry_count: 0 }];
      writes = 0;
      const response = await POST(request(action));
      assert.equal(response.status, 409, `${action} rejects Gelato`);
      assert.equal(writes, 0, `${action} does not mutate Gelato`);
      const body = await response.json();
      assert.match(body.error, /Print Status/);
      assert.equal(body.printStatusOrders[0].href, '/orders/synthetic-order?stage=print-status');
    }

    for (const action of actions) {
      selectedRows = []; writes = 0;
      assert.equal((await POST(request(action))).status, 409, 'missing target fails before update');
      assert.equal(writes, 0);
    }

    for (const action of actions) {
      selectedRows = [{ id: 1, orderId: 'synthetic-lulu-order', print_provider: 'lulu', retry_count: 0 }];
      mutationMode = 'error';
      writes = 0;
      const failed = await POST(request(action));
      assert.equal(failed.status, 500, `${action} reports update errors`);
      assert.equal(writes, 1, `${action} attempted only the mocked mutation`);

      mutationMode = 'zero-rows';
      writes = 0;
      const unchanged = await POST(request(action));
      assert.equal(unchanged.status, 500, `${action} reports zero affected rows`);
      assert.equal(writes, 1, `${action} attempted only the mocked mutation`);

      mutationMode = 'became-gelato'; writes = 0;
      assert.equal((await POST(request(action))).status, 500, 'provider change between read and write cannot report recovery');
      assert.equal(writes, 1);

      mutationMode = 'success';
      writes = 0;
      const success = await POST(request(action));
      assert.equal(success.status, 200, `${action} preserves Lulu recovery`);
      assert.equal((await success.json()).recovered, 1);
      assert.equal(writes, 1, `${action} reports success after one affected row`);
    }

    selectedRows = [
      { id: 1, orderId: 'synthetic-lulu-order', print_provider: 'lulu', retry_count: 0 },
      { id: 2, orderId: 'synthetic-gelato-order', print_provider: 'gelato', retry_count: 0 },
    ];
    writes = 0;
    const mixed = await POST(new NextRequest('http://localhost:3117/api/admin/orders-needing-attention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3117' },
      body: JSON.stringify({ orderIds: [1, 2], action: 'manual_review' }),
    }));
    assert.equal(mixed.status, 409, 'mixed provider selection fails closed');
    assert.equal(writes, 0, 'mixed provider selection makes no partial mutation');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }

  console.log('Gelato attention recovery API: Gelato and mixed selections rejected; Lulu update outcomes checked');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
