import assert from 'node:assert/strict';
import { reconcileAsset, sha256, type AssetEntry, type AssetStore } from '../src/lib/books/immutable-asset-upload';

const BOOK = 'book-finding-our-inner-voice';
const bytes = new TextEncoder().encode('approved PNG bytes');
const entry: AssetEntry = {
  taskId: 'p09-cat-background', source: 'art.png', sha256: sha256(bytes),
  r2Key: `${BOOK}/v2/backgrounds/page_09-cat.png`, uploadApproved: true,
};

function store(initial?: Uint8Array, race?: Uint8Array): { client: AssetStore; objects: Map<string, Uint8Array>; puts: () => number } {
  const objects = new Map<string, Uint8Array>();
  if (initial) objects.set(entry.r2Key, initial);
  let putCount = 0;
  const client: AssetStore = {
    async get(key) {
      const data = objects.get(key);
      return data ? new Response(new TextDecoder().decode(data), { status: 200 }) : new Response(null, { status: 404 });
    },
    async putIfAbsent(key, value, contentType) {
      putCount++;
      assert.equal(contentType, 'image/png');
      if (race) objects.set(key, race);
      if (objects.has(key)) return new Response(null, { status: 412 });
      objects.set(key, value);
      return new Response(null, { status: 200 });
    },
  };
  return { client, objects, puts: () => putCount };
}

async function main(): Promise<void> {
  const fresh = store();
  assert.equal(await reconcileAsset(fresh.client, entry, bytes, BOOK, 2, false), 'would-upload');
  assert.equal(fresh.puts(), 0);
  assert.equal(await reconcileAsset(fresh.client, entry, bytes, BOOK, 2, true), 'uploaded');
  assert.equal(await reconcileAsset(fresh.client, entry, bytes, BOOK, 2, true), 'already-present');
  assert.equal(fresh.puts(), 1);
  await assert.rejects(reconcileAsset(store(new TextEncoder().encode('wrong')).client, entry, bytes, BOOK, 2, true), /R2 key collision/);
  assert.equal(await reconcileAsset(store(undefined, bytes).client, entry, bytes, BOOK, 2, true), 'already-present');
  await assert.rejects(reconcileAsset(store(undefined, new TextEncoder().encode('wrong')).client, entry, bytes, BOOK, 2, true), /R2 byte verification failed/);
  await assert.rejects(reconcileAsset(store().client, { ...entry, uploadApproved: false }, bytes, BOOK, 2, true), /not approved/);
  await assert.rejects(reconcileAsset(store().client, { ...entry, sha256: '0'.repeat(64) }, bytes, BOOK, 2, true), /Catalog hash mismatch/);
  await assert.rejects(reconcileAsset(store().client, { ...entry, r2Key: `${BOOK}/v1/backgrounds/old.png` }, bytes, BOOK, 2, true), /Unsafe asset key/);
  await assert.rejects(reconcileAsset({ get: async () => new Response(null, { status: 403 }), putIfAbsent: async () => new Response(null, { status: 200 }) }, entry, bytes, BOOK, 2, false), /R2 read failed/);
  console.log('test-immutable-asset-upload: ok');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
