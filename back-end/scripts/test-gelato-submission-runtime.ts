import assert from 'node:assert/strict';
import { gelatoSubmissionRuntime } from '../src/lib/books/gelato-submission-runtime';
import { quoteGelatoSubmission } from '../src/lib/books/gelato-submission';
import type { GelatoSubmissionContext } from '../src/lib/books/gelato-submission-store';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildOrderIntakeManifestFromNormalizedInputRuntime, buildW0OrderUpsertPayload } from '../src/lib/w0-manifest-builder';
import { buildPreviewImageAssetKey } from '../src/lib/order-paths';

const bookId = 'book-finding-our-inner-voice';
const now = new Date('2026-10-13T20:00:00Z');
const token = '22222222-2222-4222-8222-222222222222';
const submissionId = '11111111-1111-4111-8111-111111111111';

async function scenario(mode: 'single' | 'siblings') {
  const root = `TEST-GELATO-RUNTIME-${mode}`;
  const rows = new Map<string, Record<string, unknown>>();
  const manifests = new Map<string, unknown>();
  const ids = mode === 'single' ? [root] : [`${root}-1`, `${root}-2`];
  for (const [index, orderId] of ids.entries()) {
    const formatId = mode === 'single' ? 'standard' : 'amazon';
    const normalizedInput = {
      orderId, ...(mode === 'siblings' ? { amazonOrderId: root, marketplaceId: 'ATVPDKIKX0DER' } : {}),
      customerEmail: 'test@example.com', shippingTier: 'standard',
      characterSpecs: { childName: 'Sandbox', age: 5, pronouns: 'she-her', skinTone: 'light', hairStyle: 'bun', hairColor: 'brown', favoriteColor: 'blue', favoriteAnimal: 'fox' },
      bookSpecs: { bookId, formatId, testMode: true },
      orderDetails: { quantity: 1, shippingAddress: { name: 'Synthetic Draft Proof', address_line1: '451 Clarkson Ave', city: 'Brooklyn', state_code: 'NY', postcode: '11203', country_code: 'US' } },
      _raw: { root_order_id: root },
    };
    const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(normalizedInput, {
      schemaVersion: 'v3', bookId, configVersion: 2, formatId, configSource: 'bundled',
    });
    const intake = normalizeW0Manifest(built.manifest);
    const prefix = `${bookId}/orders/${orderId}`;
    const three = buildW3Manifest({ orderId, rootOrderId: root, bookId, formatId, configVersion: 2,
      renderSnapshot: intake.renderSnapshot, orderR2BaseKey: prefix, oneManifestKey: built.manifestKey,
      pagePreviewImages: intake.pagePlan.map(page => ({ pageNumber: page.index, r2Key: buildPreviewImageAssetKey(prefix, page.label) })),
      coverPngR2Key: `${prefix}/preview-images/cover-spread.png`,
    }, { intake });
    const summary = three.manifest.summary as Record<string, unknown>;
    assert.equal(summary.readyForBook, false);
    manifests.set(built.manifestKey, built.manifest);
    manifests.set(`${prefix}/manifests/3-manifest.json`, { ...three.manifest,
      summary: { ...summary, readyForBook: true }, testOnly: true,
      syntheticProof: { artworkApproved: false, realW3Ready: false },
    });
    rows.set(orderId, { ...buildW0OrderUpsertPayload({ normalizedInput, ...built }),
      id: index + 1, print_submission_id: submissionId, print_claim_token: token,
    });
  }
  const context: GelatoSubmissionContext = { providerOrders: [], submission: {
    id: submissionId, provider: 'gelato', root_order_id: root, order_reference_id: 'lhb-gelato-runtime-test',
    workflow_job_idempotency_key: 'runtime-test', claim_token: token, lease_expires_at: '2026-10-13T20:15:00Z',
    request_state: 'claimed', owning_execution_id: null, send_started_at: null, accepted_root_order_id: null,
    quote_snapshot: null, request_snapshot: null, quote_id: null, shipment_method_uid: null,
    shipment_policy_version: null, quoted_at: null, quote_request_fingerprint: null,
  }, members: ids.map((key, index) => ({ submission_id: submissionId, child_order_id: index + 1, child_order_key: key,
    item_reference_id: `lhb-item-${index + 1}`, artifact_key: `${bookId}/orders/${key}/gelato/print/v2/${'a'.repeat(24)}.pdf`,
    artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: token, pdf_page_count: 35,
    provider_order_id: null, provider_item_id: null, status: null,
  })) };
  let quoteCalls = 0;
  let transitions = 0;
  const reads = new Map<string, number>();
  let replacement: Record<string, unknown> | null | undefined;
  let rotateOnReread = false;
  const runtime = gelatoSubmissionRuntime({
    loadOrder: async (key) => {
      reads.set(key, (reads.get(key) ?? 0) + 1);
      if (rotateOnReread && reads.get(key) === 2) return { ...rows.get(key), print_claim_token: 'rotated-token' };
      return replacement === undefined ? rows.get(key) ?? null : replacement;
    },
    loadManifest: async (key) => manifests.get(key) ?? null,
  });
  const identity = { submissionId, claimToken: token, executionId: 'runtime-test', mode };
  const dependencies = { ...runtime, now: () => now, artifactExists: async () => true,
    store: { load: async () => context, transition: async (name: string, params: Record<string, unknown>) => {
      assert.equal(name, 'record_gelato_quote_snapshot'); transitions++;
      const snapshot = params.p_snapshot as { request: { orderType: string; items: Array<{ pageCount: number; files: Array<{ url: string }> }> } };
      assert.equal(snapshot.request.orderType, 'draft');
      assert.equal(snapshot.request.items.length, ids.length);
      for (const [index, item] of snapshot.request.items.entries()) {
        assert.equal(item.pageCount, 32);
        assert.equal(item.files[0].url, `${runtime.backendUrl}/api/pdf/${context.members[index].artifact_key}`);
      }
      return {};
    } },
    quote: async (request: Parameters<NonNullable<typeof runtime.quote>>[0]) => {
      quoteCalls++;
      assert.equal(request.products.length, ids.length);
      assert.equal(request.customerReferenceId, root);
      return { orderReferenceId: request.orderReferenceId, quotes: [{ id: 'runtime-quote',
        itemReferenceIds: request.products.map(item => item.itemReferenceId), products: request.products,
        shipmentMethods: [{ shipmentMethodUid: 'usps_ground_advantage', type: 'normal' }] }] };
    },
    create: async () => { throw new Error('Runtime quote test must not create provider orders'); },
  };
  for (const key of ids) {
    const input = await runtime.loadPrintInput(key);
    assert.equal(input.bookId, bookId); assert.equal(input.formatId, mode === 'single' ? 'standard' : 'amazon');
    assert.equal(input.pagePlan.length, 32); assert.equal(input.providerPrintConfig.expectedPdfPageCount, 35);
    assert.equal(reads.get(key), 1, 'Builder lookup must reuse its checked row');
  }
  reads.clear();
  await quoteGelatoSubmission(identity, dependencies);
  assert.equal(quoteCalls, 1); assert.equal(transitions, 1);
  for (const key of ids) assert.equal(reads.get(key), 2, 'Quote service must reread current ownership');
  const original = rows.get(ids[0])!;
  for (const invalid of [null, { ...original, orderId: `${ids[0]}-other` },
    { ...original, one_manifest_url: 'https://untrusted.invalid/manifest.json' },
    { ...original, print_provider: 'lulu' }, { ...original, print_product_uid: 'different-product' }]) {
    replacement = invalid;
    await assert.rejects(quoteGelatoSubmission(identity, dependencies), /persisted order row|identity mismatch|canonical order-scoped|non-Gelato|frozen assignment mismatch/);
    assert.equal(quoteCalls, 1); assert.equal(transitions, 1);
  }
  replacement = undefined;
  reads.clear(); rotateOnReread = true;
  await assert.rejects(quoteGelatoSubmission(identity, dependencies), /canonical order and PDF receipt/);
  assert.equal(quoteCalls, 1); assert.equal(transitions, 1);
  rotateOnReread = false;
  const threeKey = `${bookId}/orders/${ids[0]}/manifests/3-manifest.json`;
  const three = manifests.get(threeKey) as { summary: Record<string, unknown> };
  manifests.set(threeKey, { ...three, summary: { ...three.summary, readyForBook: false } });
  await assert.rejects(quoteGelatoSubmission(identity, dependencies), /original W3 source/);
  assert.equal(quoteCalls, 1); assert.equal(transitions, 1);
}

void scenario('single').then(() => scenario('siblings')).then(() => console.log('Gelato runtime canonical lookup and quote checks passed')).catch(error => { console.error(error); process.exitCode = 1; });
