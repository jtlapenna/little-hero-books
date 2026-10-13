import assert from 'node:assert/strict';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { assertPrintAssignmentCompatible } from '../src/lib/books/print-assignment';
import { prepareFrozenW0Manifest, type W0ManifestStorage } from '../src/lib/books/freeze-w0-manifest';
import type { BuildOrderIntakeManifestResult } from '../src/lib/w0-manifest-builder';

const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 1 });
const input = { orderId: 'TEST-W0-FREEZE', bookSpecs: { testMode: true } };
const candidate = (book = config, dedication = 'Original'): BuildOrderIntakeManifestResult => {
  const manifest = buildW0RunManifestFromConfig(book, { orderId: input.orderId, formatId: 'standard', platform: 'd2c',
    input: { bookSpecs: { testMode: true }, dedicationText: dedication } });
  return { manifest, manifestKey: manifest.artifacts.manifestKey, schemaVersion: 'v3', bookId: book.bookId, formatId: 'standard' };
};
function memoryStorage() {
  const objects = new Map<string, Record<string, unknown>>();
  let row: Record<string, unknown> | null = null;
  let rejectPersistence = false;
  const storage: W0ManifestStorage = {
    loadOrder: async () => row ? structuredClone(row) : null,
    loadManifest: async (key) => objects.get(key) ?? null,
    createManifest: async (key, manifest) => {
      if (objects.has(key)) return false;
      objects.set(key, structuredClone(manifest)); return true;
    },
    persistOrder: async (payload) => {
      if (rejectPersistence) return { data: null, error: new Error('Synthetic persistence failure') };
      try { assertPrintAssignmentCompatible(row ?? {}, payload); }
      catch (error) { return { data: null, error: error as Error }; }
      row = { id: 1, ...row, ...payload }; return { data: row, error: null };
    },
  };
  return { objects, storage, get row() { return row; }, set row(value) { row = value; }, set reject(value: boolean) { rejectPersistence = value; } };
}

async function main() {
  const first = memoryStorage();
  const original = candidate();
  const published = await prepareFrozenW0Manifest(input, original, first.storage, true);
  assert.equal(published.created, true);
  assert.equal(first.row?.print_manifest_key, original.manifestKey);
  first.row = { ...first.row!, execution_status: 'done', next_workflow: '4', status: 'shipped', workflow_step: 'print_fulfillment', customer_email: 'corrected@example.test' };
  const repeated = await prepareFrozenW0Manifest(input, candidate(config, 'Changed'), first.storage, true);
  assert.equal(repeated.reused, true);
  assert.deepEqual(repeated.manifest, published.manifest);
  assert.equal(first.row?.execution_status, 'done');
  assert.equal(first.row?.next_workflow, '4');
  assert.equal(first.row?.status, 'shipped');
  assert.equal(first.row?.workflow_step, 'print_fulfillment');
  assert.equal(first.row?.customer_email, 'corrected@example.test');
  await assert.rejects(prepareFrozenW0Manifest({ ...input, characterHash: 'changed-hash' }, candidate(), first.storage, true), /character identity mismatch/);
  await assert.rejects(prepareFrozenW0Manifest(input, candidate(loadBundledBookConfig({ bookId: config.bookId, version: 2 })), first.storage, true), /Frozen print assignment mismatch/);
  assert.equal(first.objects.size, 1);

  const concurrent = memoryStorage();
  const results = await Promise.all([prepareFrozenW0Manifest(input, candidate(config, 'A'), concurrent.storage, true),
    prepareFrozenW0Manifest(input, candidate(config, 'B'), concurrent.storage, true)]);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.deepEqual(results[0].manifest, results[1].manifest);
  assert.equal(concurrent.objects.size, 1);

  const crossBook = memoryStorage();
  const another = JSON.parse(JSON.stringify(config).replaceAll(config.bookId, 'other-same-print-book')) as typeof config;
  const crossResults = await Promise.allSettled([prepareFrozenW0Manifest(input, candidate(), crossBook.storage, true),
    prepareFrozenW0Manifest(input, candidate(another), crossBook.storage, true)]);
  assert.equal(crossResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(crossBook.row?.print_book_id, config.bookId);
  assert.equal(crossBook.row?.one_manifest_url, original.manifestKey);

  const recovery = memoryStorage(); recovery.reject = true;
  await assert.rejects(prepareFrozenW0Manifest(input, original, recovery.storage, true), /persistence failure/);
  assert.equal(recovery.objects.size, 1);
  assert.equal(recovery.row, null);
  recovery.reject = false;
  const recovered = await prepareFrozenW0Manifest(input, original, recovery.storage, true);
  assert.equal(recovered.reused, true);
  assert.equal(recovered.published, true);
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  const { upsertOrderByPerBookId } = await import('../src/lib/supabase-client');
  const previousFetch = globalThis.fetch;
  let database: Record<string, unknown> = { ...first.row!, character_hash: 'frozen-hash' };
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).origin, 'https://db.example.test');
    if (init?.method === 'PATCH') { writes++; return new Response('null', { headers: { 'Content-Type': 'application/json' } }); }
    return new Response(JSON.stringify(database), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const reuse = await upsertOrderByPerBookId({ ...published.orderUpsert, character_hash: 'frozen-hash' }, { preserveFrozenIntake: true });
    assert.equal(reuse.error, null); assert.equal(writes, 0); assert.equal(reuse.data?.status, 'shipped');
    const complete = { ...database };
    database = { ...database, print_book_id: null, print_format_id: null, print_manifest_key: null, print_config_version: null };
    globalThis.fetch = async (url, init) => {
      if (init?.method === 'PATCH') {
        const payload = JSON.parse(String(init.body));
        assert.deepEqual(Object.keys(payload).sort(), ['print_book_id', 'print_config_version', 'print_format_id', 'print_manifest_key']);
        database = { ...database, ...payload };
      }
      return new Response(JSON.stringify(database), { headers: { 'Content-Type': 'application/json' } });
    };
    const completed = await upsertOrderByPerBookId({ ...published.orderUpsert, character_hash: 'frozen-hash' }, { preserveFrozenIntake: true });
    assert.equal(completed.error, null); assert.equal(completed.data?.status, 'shipped');
    assert.equal(completed.data?.print_manifest_key, published.manifestKey);
    database = complete;
    database = { ...database, execution_status: 'pending_w0' };
    // A workflow can advance after the read. A conditional PATCH then matches no row.
    let reads = 0;
    globalThis.fetch = async (url, init) => {
      const parsed = new URL(String(url));
      if (init?.method === 'PATCH') {
        assert.equal(parsed.searchParams.get('execution_status'), 'eq.pending_w0');
        database = { ...database, execution_status: 'processing', current_workflow: '3' };
        return new Response('null', { headers: { 'Content-Type': 'application/json' } });
      }
      reads++; return new Response(JSON.stringify(database), { headers: { 'Content-Type': 'application/json' } });
    };
    const raced = await upsertOrderByPerBookId({ ...published.orderUpsert, character_hash: 'frozen-hash' }, { preserveFrozenIntake: true });
    assert.equal(raced.error, null); assert.equal(raced.data?.execution_status, 'processing'); assert.equal(reads, 2);
  } finally { globalThis.fetch = previousFetch; }
  console.log('W0 immutable publication regressions passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
