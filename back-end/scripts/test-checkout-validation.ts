import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/checkout/create/route';

async function main() {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw new Error('External transport forbidden in checkout validation test'); };
  console.error = () => {};
  const validShape = {
    shipping_address: { name: 'Synthetic Adult', address_line1: '1 Test Lane', city: 'Test City', state: 'CA', postal_code: '00000', country: 'US' },
    customer_email: 'buyer@example.test',
    character_specs: { childName: 'Synthetic Child', age: 5 },
  };
  try {
    for (const [label, payload, field] of [
      ['empty object', {}, 'shipping_address'],
      ['invalid email', { ...validShape, customer_email: 'invalid' }, 'customer_email'],
      ['negative age', { ...validShape, character_specs: { ...validShape.character_specs, age: -1 } }, 'character_specs.age'],
      ['inner voice name over 30', { ...validShape, product_info: { bookId: 'book-finding-our-inner-voice' }, character_specs: { ...validShape.character_specs, childName: 'Christopher Alexander Johnstons' } }, 'character_specs.childName'],
      ['inner voice second book name over 30', { ...validShape, product_info: { bookId: 'book-finding-our-inner-voice' }, character_specs: undefined, books: [
        { character_specs: { childName: 'Bo', age: 5 } },
        { character_specs: { childName: 'Christopher Alexander Johnstons', age: 5 } },
      ] }, 'books.1.character_specs.childName'],
    ] as const) {
      const response = await POST(new NextRequest('https://admin.example.test/api/checkout/create', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'synthetic-validation-' + label }, body: JSON.stringify(payload),
      }));
      assert.equal(response.status, 400, label);
      const body = await response.json();
      assert.equal(body.error, 'Validation failed');
      assert.ok(Array.isArray(body.fields));
      assert.ok(body.fields.some((item: { path: string }) => item.path === field), label + ' identifies the invalid field');
    }
    const draftBook = await POST(new NextRequest('https://admin.example.test/api/checkout/create', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'synthetic-inner-voice-draft' },
      body: JSON.stringify({ ...validShape, product_info: { bookId: 'book-finding-our-inner-voice' }, character_specs: { childName: 'Christopher Alexander Johnston', age: 5 } }),
    }));
    assert.equal(draftBook.status, 409, 'A valid 30-character name passes validation, but draft checkout is unavailable');
    assert.equal((await draftBook.json()).error, 'This book is not available for checkout yet.');
    const malformed = await POST(new NextRequest('https://admin.example.test/api/checkout/create', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'synthetic-malformed-json' }, body: '{',
    }));
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, 'Invalid JSON');
    assert.equal(externalCalls, 0, 'All invalid input must stop before storage, payment or workflow access');
    console.log('Checkout invalid-input and draft boundary: 7 cases passed; 0 external calls');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}
void main().catch((error: unknown) => { console.error(String(error)); process.exitCode = 1; });
