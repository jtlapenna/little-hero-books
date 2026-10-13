import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { assertPrintAssignmentCompatible } from '../src/lib/books/print-assignment';

async function main() {
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  const originalFetch = globalThis.fetch;
  let record: Record<string, unknown>;
  let updates = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://db.example.test');
    assert.equal(url.pathname, '/rest/v1/orders');
    if (init?.method === 'PATCH') {
      const incoming = JSON.parse(String(init.body));
      assert.equal(Object.hasOwn(incoming, 'print_provider'), false);
      record = { ...record, ...incoming };
      updates++;
    }
    const headers = new Headers(init?.headers);
    const body = headers.get('accept')?.includes('object') ? record! : [record!];
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { POST } = await import('../src/app/api/amazon/orders/route');
    for (const provider of ['lulu', 'gelato']) {
      record = { id: 7, orderId: `TEST-REPLAY-${provider}`, amazon_order_id: `TEST-REPLAY-${provider}`,
        print_provider: provider, print_config_version: provider === 'lulu' ? 1 : 2,
        status: 'pending_review', execution_status: 'done', next_workflow: '4' };
      const response = await POST(new NextRequest('https://admin.example.test/api/amazon/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          orderId: record.orderId, amazonOrderId: record.amazon_order_id, buyer: { email: 'synthetic@example.test' }, items: [],
        }),
      }));
      assert.equal(response.status, 200, `${provider} repeated intake must preserve print assignment`);
      assert.equal(record.print_provider, provider);
      assert.equal(record.execution_status, 'done');
    }
    assert.equal(updates, 2);
    assert.doesNotThrow(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { customer_name: 'Synthetic' }));
    assert.throws(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { print_provider: null }), /Frozen print assignment mismatch/);
    assert.throws(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { print_provider: 'lulu' }), /Frozen print assignment mismatch/);
    assert.doesNotThrow(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { print_provider: 'gelato' }));
  } finally { globalThis.fetch = originalFetch; }
  console.log('Gelato repeated intake regression passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
