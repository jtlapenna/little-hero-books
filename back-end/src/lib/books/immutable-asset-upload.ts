import { createHash } from 'node:crypto';

export type AssetEntry = {
  taskId: string;
  source: string;
  sha256: string;
  r2Key: string;
  uploadApproved: boolean;
};

export type AssetStore = {
  get(key: string): Promise<Response>;
  putIfAbsent(key: string, bytes: Uint8Array, contentType: string): Promise<Response>;
};

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateAssetEntry(entry: AssetEntry, bytes: Uint8Array, bookId: string, version: number): void {
  if (!entry.uploadApproved) throw new Error(`Asset is not approved: ${entry.taskId}`);
  if (!entry.r2Key.startsWith(`${bookId}/v${version}/`) || !entry.r2Key.endsWith('.png') || entry.r2Key.includes('..')) {
    throw new Error(`Unsafe asset key: ${entry.taskId}`);
  }
  if (!/^[a-f0-9]{64}$/.test(entry.sha256) || sha256(bytes) !== entry.sha256) {
    throw new Error(`Catalog hash mismatch: ${entry.taskId}`);
  }
}

async function getHash(store: AssetStore, key: string): Promise<string | null> {
  const response = await store.get(key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 read failed for ${key}: ${response.status}`);
  return sha256(new Uint8Array(await response.arrayBuffer()));
}

export async function reconcileAsset(
  store: AssetStore,
  entry: AssetEntry,
  bytes: Uint8Array,
  bookId: string,
  version: number,
  write: boolean,
): Promise<'already-present' | 'would-upload' | 'uploaded'> {
  validateAssetEntry(entry, bytes, bookId, version);
  const existing = await getHash(store, entry.r2Key);
  if (existing === entry.sha256) return 'already-present';
  if (existing !== null) throw new Error(`R2 key collision: ${entry.r2Key}`);
  if (!write) return 'would-upload';
  const result = await store.putIfAbsent(entry.r2Key, bytes, 'image/png');
  if (result.status !== 412 && !result.ok) throw new Error(`R2 upload failed for ${entry.r2Key}: ${result.status}`);
  const verified = await getHash(store, entry.r2Key);
  if (verified !== entry.sha256) throw new Error(`R2 byte verification failed: ${entry.r2Key}`);
  return result.status === 412 ? 'already-present' : 'uploaded';
}
