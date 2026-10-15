import assert from 'node:assert/strict';
import type { GelatoMember } from '../src/lib/books/gelato-submission-store';

async function main() {
  const env = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key', CLOUDFLARE_ACCOUNT_ID: 'synthetic-runtime',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret', BACKEND_URL: 'https://admin.littleherolabs.com' };
  Object.assign(process.env, env);
  const [{ gelatoLifecycleRuntime }, { gelatoSubmissionRuntime }] = await Promise.all([
    import('../src/lib/books/gelato-lifecycle-runtime'), import('../src/lib/books/gelato-submission-runtime')]);
  const key = `book/orders/TEST-SYNTHETIC/gelato/print/v2/${'a'.repeat(24)}.pdf`, expected = `https://admin.littleherolabs.com/api/pdf/${key}`;
  const provider = 'https://gelato-api-live.s3.eu-west-1.amazonaws.com/synthetic.pdf';
  const member = { child_order_key: 'TEST-SYNTHETIC', artifact_key: key, artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: 'synthetic-token', pdf_page_count: 35 } as GelatoMember;
  const originalFetch = globalThis.fetch;
  try {
    for (const factory of [gelatoLifecycleRuntime, gelatoSubmissionRuntime]) for (const scenario of ['match', 'r2-redirect', 'provider-redirect', 'mismatch']) {
      const requests: string[] = [];
      globalThis.fetch = async (input, options) => {
        const request = input instanceof Request ? input : new Request(input, options), url = new URL(request.url);
        assert.equal(request.method, 'GET'); assert.equal(options?.redirect, 'manual'); assert.ok(options?.signal);
        const leg = url.hostname === 'little-hero-orders.synthetic-runtime.r2.cloudflarestorage.com' ? 'r2' : url.hostname === 'gelato-api-live.s3.eu-west-1.amazonaws.com' ? 'provider' : 'forbidden';
        requests.push(leg);
        assert.notEqual(leg, 'forbidden', 'No DB, create, notification or redirect destination request');
        if (scenario === `${leg}-redirect`) return new Response('identical', { status: 302, headers: { Location: 'https://unapproved.example/never-follow' } });
        return new Response(scenario === 'mismatch' && leg === 'provider' ? 'changed' : 'identical');
      };
      const verifier = factory().verifyStoredFile!;
      if (scenario === 'match') assert.equal(await verifier(member, provider, expected), true);
      else if (scenario === 'mismatch') assert.equal(await verifier(member, provider, expected), false);
      else await assert.rejects(verifier(member, provider, expected));
      assert.deepEqual(requests, scenario === 'r2-redirect' ? ['r2'] : ['r2', 'provider']);
    }
  } finally { globalThis.fetch = originalFetch; }
  console.log('Actual lifecycle/submission runtime R2/provider fetches: manual redirects, matching bytes, redirect rejection and mismatch passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
