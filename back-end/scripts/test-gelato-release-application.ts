/** Real application handler/core with fake database/provider ports. No environment files or real network. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://release-app.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    BACKEND_API_TOKEN: 'synthetic-print-app-token-at-least-thirty-two-bytes' });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('No real network in application checks'); };
  const cases: string[] = [];
  try {
    const { createOrdinaryReleaseHttpHandler } = await import('../src/lib/books/gelato-ordinary-release-application');
    const { ordinaryReleaseApplicationRuntime, composeOrdinaryReleaseRuntime } = await import('../src/lib/books/gelato-ordinary-release-runtime');
    const { createOrdinaryReleaseFixture } = await import('./helpers/gelato-ordinary-release-fixture');
    const { ordinaryReleaseDigest } = await import('../src/lib/books/gelato-ordinary-release-core');
    const identity = { ok: true as const, mode: 'access' as const, actor: 'operator@example.test' };
    const post = (body: unknown) => new Request('https://admin.example.test/api/admin/gelato-release', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const check = async (name: string, run: () => Promise<void>) => { await run(); cases.push(name); };
    async function setup() {
      const fixture = await createOrdinaryReleaseFixture();
      const registered = new Map<string, { permit: unknown; actor: string }>();
      let registrations = 0;
      const handler = createOrdinaryReleaseHttpHandler({ authenticate: async () => identity, runtime: async () => ({ kind: 'ready', application: {
        release: fixture.d, approvers: new Set([identity.actor]),
        register: async input => {
          assert.equal(ordinaryReleaseDigest(input.packet), input.permit.packetSha256);
          assert.equal(input.actor, identity.actor); assert.match(input.approvalEvidenceSha256, /^[a-f0-9]{64}$/);
          if (registered.size) throw Error('Duplicate approval root');
          registrations++; registered.set(input.permit.id, { permit: structuredClone(input.permit), actor: input.actor }); return input.permit.id;
        },
        approved: async id => registered.get(id) ?? null,
      } }) });
      return { ...fixture, handler, registered, registrations: () => registrations };
    }
    await check('unauthenticated and backend automation cannot issue an approval', async () => {
      let runtimes = 0;
      for (const auth of [{ ok: false as const, response: new Response(null, { status: 401 }) },
        { ok: true as const, mode: 'token' as const, actor: 'backend-automation' }]) {
        const handler = createOrdinaryReleaseHttpHandler({ authenticate: async () => auth,
          runtime: async () => { runtimes++; throw Error('Must not load runtime'); } });
        assert.equal((await handler(post({ action: 'review' }))).status, auth.ok ? 403 : 401);
      }
      assert.equal(runtimes, 0);
    });
    await check('installed route is blocked without a financial adapter, including with enabled environment flags', async () => {
      process.env.GELATO_ORDINARY_RELEASE_ENABLED = 'true';
      const handler = createOrdinaryReleaseHttpHandler({ authenticate: async () => identity, runtime: ordinaryReleaseApplicationRuntime });
      const response = await handler(post({ action: 'review', submissionId: '11111111-1111-4111-8111-111111111111', maximumTotalCents: '2000' }));
      assert.equal(response.status, 409); const result = await response.json(); assert.equal(result.canSubmit, false);
      assert(result.blockers.includes('payable_price_policy_decision_required')); assert.equal(result.providerMutationAttempted, false);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      delete process.env.GELATO_ORDINARY_RELEASE_ENABLED;
      const source = await readFile('src/app/api/admin/gelato-release/route.ts', 'utf8');
      assert(source.includes('createOrdinaryReleaseHttpHandler')); assert(source.includes('ordinaryReleaseApplicationRuntime'));
    });
    await check('ordinary placeholder review -> exact human approval -> one code submission and no replay', async () => {
      const s = await setup();
      const review = await s.handler(post({ action: 'review', submissionId: s.permit.submissionId, maximumTotalCents: s.permit.maximumTotalCents }));
      assert.equal(review.status, 200, await review.clone().text()); const result = await review.json();
      assert.equal(result.state, 'review_required'); assert.equal(result.canSubmit, false); assert.equal(s.stats().patches, 0); assert.equal(s.registrations(), 0);
      Object.assign(s.permit, result.permit);
      const approval = await s.handler(post({ action: 'approve', permit: result.permit, approvedPacketSha256: result.packetSha256, approveExactOrder: true }));
      assert.equal(approval.status, 200, await approval.clone().text()); assert.equal((await approval.json()).state, 'approved');
      assert.equal(s.registrations(), 1); assert.equal(s.stats().patches, 0);
      const execute = { action: 'execute', permitId: result.permit.id, approvedPacketSha256: result.packetSha256 };
      const sent = await s.handler(post(execute)); assert.equal(sent.status, 200); const outcome = await sent.json();
      assert.equal(outcome.state, 'converted'); assert.equal(outcome.persistenceConfirmed, true); assert.equal(s.stats().patches, 1);
      assert.equal((await (await s.handler(post(execute))).json()).state, 'already_attempted'); assert.equal(s.stats().patches, 1);
      s.assertClean();
    });
    await check('an approval is required even when exact files and core checks pass', async () => {
      const s = await setup(); const response = await s.handler(post({ action: 'execute', permitId: s.permit.id, approvedPacketSha256: s.permit.packetSha256 }));
      assert.equal(response.status, 409); assert.equal(s.stats().claims, 0); assert.equal(s.stats().patches, 0);
    });
    for (const change of ['digest', 'file', 'revision', 'price', 'expired'] as const) {
      await check(change + ' change cannot become an approved print', async () => {
        const s = await setup();
        if (change === 'file') s.f.blobs.set(s.permit.artifacts[0].key, Buffer.from('changed placeholder'));
        if (change === 'revision') s.f.rows.values().next().value!.customer_approval_status = 'revision_requested';
        if (change === 'price') s.setPayable({ ...s.fullPayable, totalCents: '1' });
        if (change === 'expired') s.setTime(new Date('2026-10-17T12:00:00Z'));
        const response = await s.handler(post({ action: 'approve', permit: s.permit,
          approvedPacketSha256: change === 'digest' ? '0'.repeat(64) : s.permit.packetSha256, approveExactOrder: true }));
        assert.equal(response.status, 409); assert.equal(s.registrations(), 0); assert.equal(s.stats().patches, 0); s.assertClean();
      });
    }
    await check('revocation after recorded approval is checked by the execution core', async () => {
      const s = await setup();
      assert.equal((await s.handler(post({ action: 'approve', permit: s.permit, approvedPacketSha256: s.permit.packetSha256, approveExactOrder: true }))).status, 200);
      s.f.rows.values().next().value!.customer_approval_status = 'revision_requested';
      const result = await (await s.handler(post({ action: 'execute', permitId: s.permit.id, approvedPacketSha256: s.permit.packetSha256 }))).json();
      assert.equal(result.state, 'preflight_failed'); assert.equal(s.stats().patches, 0);
    });
    await check('persisted approval column is the actual existing service-only SQL contract', async () => {
      const s = await setup(); let reads = 0;
      const database = { from: (table: string) => { assert.equal(table, 'gelato_ordinary_release_permits'); return {
        select: (columns: string) => { assert.equal(columns, 'permit,approval_actor'); return {
          eq: (column: string, id: string) => { assert.equal(column, 'id'); assert.equal(id, s.permit.id); return {
            maybeSingle: async () => { reads++; return { data: { permit: s.permit, approval_actor: identity.actor }, error: null }; },
          }; },
        }; },
      }; } };
      const runtime = composeOrdinaryReleaseRuntime(database as never, s.d, new Set([identity.actor]));
      assert.equal(runtime.kind, 'ready'); if (runtime.kind !== 'ready') throw Error('Runtime missing');
      const record = await runtime.application.approved(s.permit.id); assert.equal(record?.actor, identity.actor); assert.equal(reads, 1);
    });
    console.log(JSON.stringify({ passed: true, checks: cases.length, cases, liveRequests: 0, providerAndFinancialEvidence: 'synthetic only', productionSubmissionEnabled: false }));
  } finally { globalThis.fetch = previous; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
