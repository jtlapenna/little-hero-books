import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import Stripe from 'stripe';
import { captureCheckoutWire, createSingleSendCheckoutAttempt, configuredCheckoutCredentials, CHECKOUT_STRIPE_API_VERSION } from '../src/lib/checkout-provider-transport-v2';

async function main() {
  for (const host of ['127.0.0.1', '192.0.2.1']) await new Promise<void>((resolve, reject) => {
    const socket = connect(443, host);
    socket.setTimeout(1500, () => { socket.destroy(); reject(Error('Network denial not proven')); });
    socket.on('connect', () => { socket.destroy(); reject(Error('Network unexpectedly connected')); });
    socket.on('error', error => { socket.destroy(); ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '') ? resolve() : reject(error); });
  });
  const paths = ['src/lib/checkout-provider-transport-v2.ts', 'scripts/test-checkout-provider-transport-v2.ts', 'package-lock.json'];
  const hashes = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  const before = hashes();
  assert.equal(JSON.parse(readFileSync('node_modules/stripe/package.json', 'utf8')).version, '14.25.0');
  const apiKey = 'sk_test_synthetic';
  const binding = { credentialKeyId: 'synthetic-test', environment: 'test' as const, stripeAccount: null };
  const credentials = configuredCheckoutCredentials([{ ...binding, apiKey }]);
  const operationId = '11111111-1111-4111-8111-111111111111';
  const payload = { mode: 'payment' as const, line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 2999, product_data: { name: 'Synthetic book' } } }],
    metadata: { order_id: operationId }, success_url: 'https://www.littleherolabs.com/create/processing', cancel_url: 'https://www.littleherolabs.com/create/checkout' };
  const payloadJson = JSON.stringify(payload);
  let accidentalGlobalFetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { accidentalGlobalFetches++; throw Error('Forbidden default transport'); };
  const observations: Record<string, unknown>[] = [];
  try {
    const manifest = await captureCheckoutWire({ credentials, binding, operationId, payloadJson });
    assert.equal(accidentalGlobalFetches, 0);
    assert.equal(manifest.bodySha256, createHash('sha256').update(manifest.body).digest('hex'));
    const roundTrip = JSON.parse(JSON.stringify(manifest));
    let successfulSends = 0;
    const successFetch: typeof fetch = async (input, init) => {
      successfulSends++;
      assert.equal(String(input), 'https://api.stripe.com/v1/checkout/sessions');
      assert.equal(init?.redirect, 'error'); assert.equal(init?.body, manifest.body);
      return Response.json({ id: 'cs_test_synthetic', object: 'checkout.session', url: 'https://checkout.example.test/synthetic' });
    };
    const successful = createSingleSendCheckoutAttempt({ credentials, binding, manifest: roundTrip, fetch: successFetch });
    const session = await successful.execute();
    assert.equal(session.id, 'cs_test_synthetic');
    await assert.rejects(successful.execute(), /already started/);
    assert.equal(successfulSends, 1); assert.deepEqual(successful.getCounts(), { invocations: 1, underlyingSends: 1 });
    observations.push({ case: 'capture-roundtrip-success-repeat', globalFetches: 0, underlyingSends: 1, repeatDenied: true });

    for (const code of ['ECONNRESET', 'EPIPE']) {
      let unguardedSends = 0;
      const unsafeFetch: typeof fetch = async () => {
        if (++unguardedSends === 1) throw Object.assign(Error('Synthetic accepted-but-response-lost'), { code });
        return Response.json({ id: 'cs_test_retry', object: 'checkout.session', url: 'https://checkout.example.test/retry' });
      };
      const raw = new Stripe(apiKey, { apiVersion: CHECKOUT_STRIPE_API_VERSION, maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(unsafeFetch), telemetry: false });
      await raw.checkout.sessions.create(payload, { idempotencyKey: manifest.idempotencyKey });
      assert.equal(unguardedSends, 2, `${code} must reproduce real SDK retry before testing guard`);
      let checkedSends = 0;
      const checkedFetch: typeof fetch = async () => { checkedSends++; throw Object.assign(Error('Synthetic accepted-but-response-lost'), { code }); };
      const attempt = createSingleSendCheckoutAttempt({ credentials, binding, manifest, fetch: checkedFetch });
      await assert.rejects(attempt.execute());
      assert.equal(checkedSends, 1);
      assert.deepEqual(attempt.getCounts(), { invocations: 2, underlyingSends: 1 });
      await assert.rejects(attempt.execute(), /already started/); assert.equal(checkedSends, 1);
      observations.push({ case: code, unguardedSends, guardedSends: checkedSends, sdkRetryBlocked: true, outcome: 'unknown-needs-reconciliation' });
    }

    const edited = { ...manifest, payloadJson: JSON.stringify({ ...payload, customer_email: 'different@example.test' }) };
    let changedSends = 0;
    const changed = createSingleSendCheckoutAttempt({ credentials, binding, manifest: edited, fetch: async () => { changedSends++; throw Error('Must not send'); } });
    await assert.rejects(changed.execute()); assert.equal(changedSends, 0);
    observations.push({ case: 'changed-payload-wire', sends: 0 });
    const flippedOrder = { ...manifest, payloadJson: JSON.stringify(Object.fromEntries(Object.entries(payload).reverse())) };
    const reordered = createSingleSendCheckoutAttempt({ credentials, binding, manifest: flippedOrder, fetch: async () => { changedSends++; throw Error('Must not send'); } });
    await assert.rejects(reordered.execute()); assert.equal(changedSends, 0);
    observations.push({ case: 'json-key-order-wire', sends: 0 });
    for (const mutation of [
      { bodySha256: '0'.repeat(64) }, { credentialSha256: '0'.repeat(64) }, { sdkVersion: 'different' },
      { idempotencyKey: 'different' }, { binding: { ...binding, credentialKeyId: 'different' } },
      { binding: { ...binding, environment: 'live' as const } }, { binding: { ...binding, stripeAccount: 'acct_different' } },
    ]) assert.throws(() => createSingleSendCheckoutAttempt({ credentials, binding, manifest: { ...manifest, ...mutation }, fetch: successFetch }));
    assert.equal(successfulSends, 1);
    observations.push({ case: 'saved-invariant-mutations', rejected: 7, additionalSends: 0 });
    assert.throws(() => configuredCheckoutCredentials([{ ...binding, apiKey: 'sk_live_synthetic' }]), /environment mismatch/);
    const switched = configuredCheckoutCredentials([{ ...binding, apiKey: 'sk_test_different' }]);
    assert.throws(() => createSingleSendCheckoutAttempt({ credentials: switched, binding, manifest, fetch: successFetch }), /manifest changed/);
    const missing = configuredCheckoutCredentials([]);
    assert.throws(() => createSingleSendCheckoutAttempt({ credentials: missing, binding, manifest, fetch: successFetch }), /context unavailable/);
    const mutable = { credentials, binding: { ...binding }, operationId, payloadJson };
    const capturing = captureCheckoutWire(mutable);
    mutable.binding.credentialKeyId = 'changed'; mutable.payloadJson = '{}'; mutable.operationId = 'changed';
    const capturedBeforeMutation = await capturing;
    const secretBearingBinding = { ...binding, apiKey, unrelatedSecret: 'synthetic-private-value' };
    const safeCapture = await captureCheckoutWire({ credentials, binding: secretBearingBinding, operationId, payloadJson });
    assert.deepEqual(Object.keys(safeCapture.binding).sort(), ['credentialKeyId', 'environment', 'stripeAccount'].sort());
    assert.equal(JSON.stringify(safeCapture).includes(apiKey), false);
    assert.equal(JSON.stringify(safeCapture).includes('synthetic-private-value'), false);
    observations.push({ case: 'secret-bearing-binding-projection', rawSecretPersisted: false, unrelatedSecretPersisted: false });
    assert.equal(capturedBeforeMutation.binding.credentialKeyId, binding.credentialKeyId);
    assert.equal(capturedBeforeMutation.payloadJson, payloadJson); assert.equal(capturedBeforeMutation.operationId, operationId);
    const descriptor = Object.getOwnPropertyDescriptor(Stripe, 'PACKAGE_VERSION');
    assert.ok(descriptor);
    try {
      Object.defineProperty(Stripe, 'PACKAGE_VERSION', { ...descriptor, value: 'different' });
      assert.throws(() => createSingleSendCheckoutAttempt({ credentials, binding, manifest, fetch: successFetch }), /SDK version changed/);
      await assert.rejects(captureCheckoutWire({ credentials, binding, operationId, payloadJson }), /SDK version changed/);
    } finally { Object.defineProperty(Stripe, 'PACKAGE_VERSION', descriptor); }
    assert.equal(successfulSends, 1);
    observations.push({ case: 'runtime-sdk-version-mismatch', additionalSends: 0, captureDenied: true, attemptDenied: true });
    observations.push({ case: 'credential-resolution-and-capture-mutation', mismatchedModeDenied: true, changedSecretDenied: true, missingKeyDenied: true, inputSnapshotStable: true, additionalSends: 0 });
    assert.equal(accidentalGlobalFetches, 0);
    assert.deepEqual(hashes(), before, 'Source changed during transport proof');
    console.log(JSON.stringify({ schema: 'lhb.checkout-transport-proof@v1', sourceHashes: before, networkDenied: true, defaultFetches: accidentalGlobalFetches,
      observations, productionReady: false, limits: 'Transport component only. No durable SQL fence, actual checkout route or browser connection yet; no provider contacted.' }));
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error('CHECKOUT_TRANSPORT_PROOF_FAILED', error); process.exitCode = 1; });
