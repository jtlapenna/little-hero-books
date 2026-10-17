import assert from 'node:assert/strict';
import { createGelatoStoredFileVerifier, GELATO_STORED_FILE_HOST } from '../src/lib/books/gelato-stored-file';
import { validateGelatoConnectedOrdersWithFiles, GelatoProviderOrderSchema } from '../src/lib/books/gelato-provider-snapshot';
import type { GelatoMember } from '../src/lib/books/gelato-submission-store';
import type { GelatoDraftOrderRequest } from '../src/lib/books/gelato-api-contract';

const key = `book/orders/child-1/gelato/print/v2/${'a'.repeat(24)}.pdf`;
const expectedUrl = `https://admin.littleherolabs.com/api/pdf/${key}`;
const providerUrl = `https://${GELATO_STORED_FILE_HOST}/synthetic.pdf`;
const member = { child_order_key: 'child-1', artifact_key: key, artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: 'token-1', pdf_page_count: 35 } as GelatoMember;
const bytes = 'synthetic immutable PDF bytes';
const request: GelatoDraftOrderRequest = { orderType: 'draft', orderReferenceId: 'proof-1', customerReferenceId: 'group-1', currency: 'USD', shipmentMethodUid: 'usps_ground_advantage', shippingAddress: { country: 'US', firstName: 'Synthetic', lastName: 'Proof', addressLine1: '1 Main St', city: 'Brooklyn', postCode: '11203', state: 'NY', email: 'test@example.com' }, items: [{ itemReferenceId: 'item-1', productUid: 'product-1', quantity: 1, pageCount: 32, files: [{ type: 'default', url: expectedUrl }] }] };
const order = GelatoProviderOrderSchema.parse({ ...request, id: 'provider-1', updatedAt: '2026-10-11T00:00:00Z', fulfillmentStatus: 'draft', items: [{ ...request.items[0], id: 'provider-item-1', fulfillmentStatus: 'created', files: [{ type: 'default', url: providerUrl }] }] });

async function main() {
  let loads = 0;
  let fetches = 0;
  const verifier = createGelatoStoredFileVerifier({ loadArtifact: async (actualKey, signal) => { loads++; assert.equal(actualKey, key); assert.equal(signal.aborted, false); return new Response(bytes); }, fetcher: async (url, options) => { fetches++; assert.equal(String(url), providerUrl); assert.equal(options?.redirect, 'manual'); assert.ok(options?.signal); return new Response(bytes); } });
  const normalized = await validateGelatoConnectedOrdersWithFiles([order], request, (reference, actualUrl, expected) => { assert.equal(reference, 'item-1'); return verifier(member, actualUrl, expected); }, true);
  assert.equal(normalized[0].items[0].files[0].url, expectedUrl);
  assert.equal(order.items[0].files[0].url, providerUrl, 'source provider graph is not mutated');
  await verifier(member, providerUrl, expectedUrl);
  assert.equal(loads, 1); assert.equal(fetches, 1, 'cache is local to this verifier');
  let checked = false;
  await assert.rejects(validateGelatoConnectedOrdersWithFiles([{ ...order, shippingAddress: { ...order.shippingAddress, postCode: '99999' } }], request, async () => { checked = true; return true; }), /recipient/);
  assert.equal(checked, false, 'invalid graph must fail before downloading');
  await assert.rejects(validateGelatoConnectedOrdersWithFiles([order], request), /registered artifact/);
  const changed = createGelatoStoredFileVerifier({ loadArtifact: async () => new Response(bytes), fetcher: async () => new Response('changed bytes') });
  await assert.rejects(validateGelatoConnectedOrdersWithFiles([order], request, (_reference, url, expected) => changed(member, url, expected)), /registered artifact/);
  for (const url of ['http://' + GELATO_STORED_FILE_HOST + '/file', 'https://evil.example.test/file', 'https://' + GELATO_STORED_FILE_HOST + '.evil.test/file', 'https://user:pass@' + GELATO_STORED_FILE_HOST + '/file', 'https://' + GELATO_STORED_FILE_HOST + ':8443/file']) {
    await assert.rejects(verifier(member, url, expectedUrl), /host/);
  }
  for (const bad of [{ ...member, artifact_key: null }, { ...member, artifact_fingerprint: 'b'.repeat(24) }, { ...member, child_order_key: 'another-child' }, { ...member, artifact_claim_token: null }, { ...member, pdf_page_count: -1 }]) {
    await assert.rejects(verifier(bad, providerUrl, expectedUrl), /receipt/);
  }
  await assert.rejects(verifier(member, providerUrl, 'https://admin.littleherolabs.com/api/pdf/another.pdf'), /receipt/);
  const perFile = createGelatoStoredFileVerifier({ maxFileBytes: 2, loadArtifact: async () => new Response(bytes), fetcher: async () => new Response(bytes) });
  await assert.rejects(perFile(member, providerUrl, expectedUrl), /byte budget/);
  const aggregate = createGelatoStoredFileVerifier({ maxOperationBytes: bytes.length + 2, loadArtifact: async () => new Response(bytes), fetcher: async () => new Response(bytes) });
  await assert.rejects(aggregate(member, providerUrl, expectedUrl), /byte budget/);
  const controller = new AbortController(); controller.abort();
  const aborted = createGelatoStoredFileVerifier({ signal: controller.signal, loadArtifact: async () => { throw new Error('must not load'); } });
  await assert.rejects(aborted(member, providerUrl, expectedUrl));
  const stalled = createGelatoStoredFileVerifier({ budgetMs: 5, loadArtifact: async () => new Response(new ReadableStream({ pull: () => new Promise(() => undefined) })) });
  const timer = setTimeout(() => { throw new Error('stream abort deadline not honored'); }, 1000);
  try { await assert.rejects(stalled(member, providerUrl, expectedUrl), /aborted/); } finally { clearTimeout(timer); }
  console.log('Gelato stored file: byte identity, receipt, host, budgets and cancellation pass');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
