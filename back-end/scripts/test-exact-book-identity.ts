import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createExactBookIdentitySupabaseReader, lookupExactBookIdentity } from '../src/lib/books/exact-book-identity';

// Compile-time compatibility check. This branch performs no network calls.
function acceptsSupabaseClient(client: SupabaseClient) {
  return createExactBookIdentitySupabaseReader(client);
}
void acceptsSupabaseClient;

const identity = 'book-1';
const row = { id: '12', orderId: identity, order_id: identity };
const adapter = (result: unknown) => ({ async readIdentity() { return result; } });

async function main() {
  assert.deepEqual(await lookupExactBookIdentity(identity, adapter({ status: 'found', row })), { status: 'found', row });
  assert.deepEqual(await lookupExactBookIdentity(identity, adapter({ status: 'absent' })), { status: 'absent' });
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'ambiguous' }))).status, 'ambiguous');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'schema_unavailable' }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'invalid_input' }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { id: '13', order_id: identity } }))).status, 'found');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { ...row, id: '9007199254740993' } }))).status, 'found');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { ...row, id: 9007199254740992 } }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { ...row, id: 12 } }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { ...row, order_id: 'other' } }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { ...row, orderId: 'other', order_id: null } }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { orderId: identity } }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'absent', row }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'unknown' }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, adapter(null))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(' book-1 ', adapter({ status: 'found', row }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, { async readIdentity() { throw new Error('db down'); } })).status, 'unavailable');
  for (const text of ['\tbook-1', 'book-1\u00a0', '\ufeffbook-1', '   ']) {
    assert.equal((await lookupExactBookIdentity(text, adapter({ status: 'absent' }))).status, 'unavailable');
    assert.equal((await lookupExactBookIdentity(identity, adapter({ status: 'found', row: { ...row, id: text } }))).status, 'unavailable');
  }
  let args: unknown;
  const rpc = createExactBookIdentitySupabaseReader({ rpc(name, params) {
    args = { name, params };
    return Promise.resolve({ data: { status: 'found', row }, error: null });
  } });
  assert.equal((await lookupExactBookIdentity(identity, rpc)).status, 'found');
  assert.deepEqual(args, { name: 'lhl_strict_book_identity', params: { p_book_id: identity } });
  assert.equal((await lookupExactBookIdentity(identity, createExactBookIdentitySupabaseReader({ rpc: () => Promise.resolve({ data: { status: 'absent' }, error: { message: 'denied' } }) }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, createExactBookIdentitySupabaseReader({ rpc: () => Promise.reject(new Error('network error')) }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, createExactBookIdentitySupabaseReader({ rpc: () => Promise.resolve({ data: null, error: null }) }))).status, 'unavailable');
  assert.equal((await lookupExactBookIdentity(identity, createExactBookIdentitySupabaseReader({ rpc: () => Promise.resolve({ data: { status: 'absent' } } as never) }))).status, 'unavailable');
  console.log('exact book identity tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
