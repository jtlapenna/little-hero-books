/** Protected quote-only diagnostics. No create, conversion, storage write or backend mutation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import config from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { BookConfigSchema, GelatoPrintConfigSchema } from '../src/lib/books/types';
import { buildGelatoQuoteRequest, validateGelatoQuote, type GelatoRecipient } from '../src/lib/books/gelato-api-contract';

const sha = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
function save(file: string, value: unknown) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
async function main() {
  assert.equal(process.argv.length, 4, 'Pass private originating repo and a new receipt directory name');
  const root = fs.realpathSync(process.argv[2]);
  assert.equal(root, '/Users/johncapogna/Sites/little-hero-books');
  assert.match(process.argv[3], /^quotes-[A-Za-z0-9-]+$/);
  const base = path.join(root, '.gelato-testing/fulfillment-2026-10-15');
  const env = parse(fs.readFileSync(path.join(root, '.gelato-testing/.env.local')));
  const retained = JSON.parse(fs.readFileSync(path.join(base, 'retained-evidence.json'), 'utf8'));
  assert.ok(env.GELATO_API_KEY?.trim()); assert.equal(sha(env.GELATO_API_KEY), retained.apiKeyFingerprint);
  const address = parse(fs.readFileSync(path.join(root, '.gelato-testing/recipient/.env.local')));
  const names = address.TEST_RECIPIENT_NAME.trim().split(/\s+/);
  const recipient: GelatoRecipient = { country:address.TEST_COUNTRY, firstName:names[0], lastName:names.slice(1).join(' '),
    addressLine1:address.TEST_ADDRESS_LINE1, city:address.TEST_CITY, state:address.TEST_STATE,
    postCode:address.TEST_POSTCODE, email:address.TEST_EMAIL,
    ...(address.TEST_ADDRESS_LINE2 ? { addressLine2:address.TEST_ADDRESS_LINE2 } : {}),
    ...(address.TEST_PHONE ? { phone:address.TEST_PHONE } : {}) };
  assert.equal(recipient.country, 'US'); assert.equal(recipient.email, 'orders@littleherolabs.com');
  for (const v of [recipient.firstName, recipient.lastName, recipient.addressLine1, recipient.city, recipient.state, recipient.postCode]) assert.ok(v?.trim());
  const specifications = [
    { label:'website-single-q1', previous:'website-single', format:'standard', quantity:1 },
    { label:'amazon-single-q1', previous:'amazon-single', format:'amazon', quantity:1 },
    { label:'amazon-siblings', previous:'amazon-siblings', format:'amazon', quantity:1 },
    { label:'website-single-q2', previous:'website-single', format:'standard', quantity:2 },
    { label:'amazon-single-q2', previous:'amazon-single', format:'amazon', quantity:2 },
  ] as const;
  const directory = path.join(base, process.argv[3]);
  fs.mkdirSync(directory, { mode:0o700 }); // Exclusive: an existing run cannot be replayed.
  const observations: unknown[] = [];
  const run = randomUUID();
  let providerGets = 0, quotePosts = 0;
  let operation = 0;
  // Network surface is deliberately closed to every route except these GETs and quote POST.
  async function send(url: string, method: 'GET' | 'POST', request?: unknown) {
    const u = new URL(url);
    assert.equal(u.origin, 'https://order.gelatoapis.com'); assert.equal(u.search, '');
    if (method === 'POST') assert.equal(u.pathname, '/v4/orders:quote');
    else assert.match(u.pathname, /^\/v4\/orders\/[a-f0-9-]{36}$/);
    save(path.join(directory, `operation-${++operation}-intent-private.json`), {at:new Date().toISOString(), method, url, requestHash:request ? sha(JSON.stringify(request)) : null});
    const response = await fetch(url, { method, headers:{ 'X-API-KEY':env.GELATO_API_KEY, ...(method === 'POST' ? { 'Content-Type':'application/json' } : {}) },
      ...(request ? { body:JSON.stringify(request) } : {}), redirect:'error', signal:AbortSignal.timeout(30_000) });
    if (method === 'POST') quotePosts++; else providerGets++;
    const text = await response.text();
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* preserve response before stopping */ }
    const observed = { httpStatus:response.status, body, rawText:text, bodySha256:sha(text), at:new Date().toISOString() };
    save(path.join(directory, `operation-${operation}-response-private.json`), observed);
    assert.ok(response.ok && body && typeof body === 'object' && !Array.isArray(body), 'Provider quote/read response not successful JSON');
    return {...observed, body};
  }
  const originals = new Map<string, Record<string, unknown>>();
  const artifacts = new Map<string, {itemReferenceId:string; key:string; bytes:number; sha256:string}>();
  let pdfGets = 0;
  for (const previous of ['website-single', 'amazon-single', 'amazon-siblings']) {
    const expected = retained.cases.find((c: {kind:string}) => c.kind === previous);
    assert.ok(expected);
    const got = await send('https://order.gelatoapis.com/v4/orders/'+expected.provider.id, 'GET');
    save(path.join(directory, previous+'-account-binding-private.json'), got);
    assert.equal(got.httpStatus, 200); assert.equal(got.body.id, expected.provider.id);
    assert.equal(got.body.orderType, 'draft'); assert.equal(got.body.financialStatus, 'draft');
    const prior = JSON.parse(fs.readFileSync(path.join(base, 'retained/'+previous+'-provider-private.json'),'utf8'));
    assert.equal(got.body.clientId, prior.clientId);
    const stableItems = (items: Array<Record<string, unknown>>) => items.map(i => Object.fromEntries(
      ['id','itemReferenceId','productUid','pageCount','quantity'].map(k => [k,i[k]]))).sort((a,b) => String(a.id).localeCompare(String(b.id)));
    assert.deepEqual(stableItems(got.body.items as Array<Record<string, unknown>>), stableItems(prior.items));
    const journal: Buffer = fs.readFileSync(path.join(root, '.git/gelato-engineering/post-fix-'+previous+'-2026-10-15.jsonl'));
    assert.equal(sha(journal), expected.journalSha256);
    const proof = journal.toString().trim().split('\n').map((line: string) => JSON.parse(line)).find((r: {kind:string}) => r.kind === 'native-refreshed-proof').data;
    assert.equal(proof.rootOrderId, got.body.id);
    assert.equal(proof.artifacts.length, previous === 'amazon-siblings' ? 2 : 1);
    assert.equal(new Set(proof.artifacts.map((a:{itemReferenceId:string}) => a.itemReferenceId)).size, proof.artifacts.length);
    for (const artifact of proof.artifacts) {
      assert.match(artifact.key, /^book-finding-our-inner-voice\/orders\/TEST-GELATO-[A-Za-z0-9-]+\/.+\.pdf$/);
      assert.ok(expected.files.some((f:{childId:number;sha256:string;bytes:number}) => f.childId === artifact.childId && f.sha256 === artifact.sha256 && f.bytes === artifact.bytes));
      assert.ok((got.body.items as Array<Record<string,unknown>>).some(i => i.itemReferenceId === artifact.itemReferenceId));
      const url = 'https://admin.littleherolabs.com/api/pdf/'+artifact.key.split('/').map(encodeURIComponent).join('/');
      save(path.join(directory, `pdf-${pdfGets+1}-intent-private.json`), {at:new Date().toISOString(),method:'GET',url,expectedSha256:artifact.sha256});
      const response = await fetch(url, {method:'GET',redirect:'error',signal:AbortSignal.timeout(30_000)});
      const bytes = new Uint8Array(await response.arrayBuffer()); pdfGets++;
      save(path.join(directory, `pdf-${pdfGets}-response.json`), {at:new Date().toISOString(),httpStatus:response.status,bytes:bytes.length,sha256:sha(bytes)});
      assert.ok(response.ok); assert.equal(bytes.length,artifact.bytes); assert.equal(sha(bytes),artifact.sha256);
      artifacts.set(artifact.itemReferenceId,artifact);
    }
    originals.set(previous, got.body);
  }
  assert.equal(pdfGets, 4); assert.equal(artifacts.size, 4);
  for (const spec of specifications) {
    const original = originals.get(spec.previous)!;
    const print = GelatoPrintConfigSchema.parse(BookConfigSchema.parse(config).formats[spec.format].print);
    const items = (original.items as Array<{itemReferenceId:string;productUid:string;pageCount:number}>).map((item, index) => {
      assert.equal(item.productUid, print.productUid); assert.equal(item.pageCount, print.apiPageCount);
      const artifact = artifacts.get(item.itemReferenceId); assert.ok(artifact);
      const fileUrl = 'https://admin.littleherolabs.com/api/pdf/'+artifact.key.split('/').map(encodeURIComponent).join('/');
      return {itemReferenceId:`QUOTE-${run}-${spec.label}-${index+1}`, productUid:print.productUid,
        pageCount:print.apiPageCount, quantity:spec.quantity, fileUrl};
    });
    const request = buildGelatoQuoteRequest({ orderReferenceId:`TEST-GELATO-QUOTE-${run}-${spec.label}`,
      customerReferenceId:`TEST-GELATO-QUOTE-${run}`, currency:'USD', recipient, items, config:print });
    const requestHash = sha(JSON.stringify(request));
    save(path.join(directory, spec.label+'-intent-private.json'), {at:new Date().toISOString(), mode:'quote-only', request, requestHash, apiKeyFingerprint:sha(env.GELATO_API_KEY)});
    const observed = await send('https://order.gelatoapis.com/v4/orders:quote', 'POST', request);
    save(path.join(directory, spec.label+'-response-private.json'), observed);
    const selection = Object.keys(print.shipmentMethodPolicy.tiers).map(tier => {
      try { const selected = validateGelatoQuote({ response:observed.body, request, config:print, shippingTier:tier, quotedAt:observed.at });
        return {tier, matched:true, shipmentMethodUid:selected.shipmentMethodUid};
      } catch { return {tier, matched:false}; }
    });
    let unsupportedTierRejected = false, unsupportedDestinationRejected = false;
    try { validateGelatoQuote({ response:observed.body, request, config:print, shippingTier:'unoffered-test-tier', quotedAt:observed.at }); } catch { unsupportedTierRejected = true; }
    try { buildGelatoQuoteRequest({orderReferenceId:'TEST-UNSUPPORTED', customerReferenceId:'TEST',currency:'USD',recipient:{...recipient,country:'CA'},items,config:print}); } catch { unsupportedDestinationRejected = true; }
    observations.push({label:spec.label, format:spec.format, itemCount:items.length, quantityPerItem:spec.quantity,
      httpStatus:observed.httpStatus, responseSha256:observed.bodySha256, at:observed.at, selection,
      unsupportedTierRejectedLocally:unsupportedTierRejected, unsupportedDestinationRejectedLocally:unsupportedDestinationRejected,
      responseTopLevelFields:Object.keys(observed.body).sort()});
    save(path.join(directory, spec.label+'-observation.json'), observations.at(-1));
  }
  const result = {at:new Date().toISOString(), run, observations, providerGets, pdfGets, quotePosts, orderCreates:0, conversions:0,
    customerMessages:0, paymentChanges:0, controlsChanged:false, diagnosticOnly:true, assets:'Retained verified PDFs; not fresh workflow proof'};
  save(path.join(directory,'summary.json'), result); console.log(JSON.stringify(result));
}
main().catch(() => { console.error('Quote diagnostic stopped; inspect owner-only receipts before any new run. No order-operation route exists in this helper.'); process.exitCode=1; });
