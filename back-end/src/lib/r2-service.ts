import { listObjects, getObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET, R2_CHARACTERS_PREFIX } from './r2-client';

export interface CharacterAsset {
  characterHash: string;
  poseNumber: number;
  url: string;
  assetType: "original" | "background-removed" | "final";
}

export async function getCharacterAssets(characterHash: string): Promise<CharacterAsset[]> {
  const prefix = `${R2_CHARACTERS_PREFIX}${characterHash}/`;
  const res = await listObjects(R2_PUBLIC_BUCKET, { prefix });

  const items = (res.Contents || []).filter(o => !!o.Key).map(o => o.Key as string);

  // Generate URLs using API proxy endpoint (works for both public and private buckets)
  const assets: CharacterAsset[] = items.map((key) => {
    const file = key.split('/').pop() || '';
    const poseMatch = file.match(/(pose[-_]?)(\d+)/i) || key.match(/\/(\d+)[^/]*$/);
    const poseNumber = poseMatch ? parseInt(poseMatch[2] || poseMatch[1], 10) || 0 : 0;
    const lower = key.toLowerCase();
    const type: CharacterAsset['assetType'] = lower.includes('final')
      ? 'final'
      : (lower.includes('bg-removed') || lower.includes('background-removed'))
        ? 'background-removed'
        : 'original';

    // Use API proxy endpoint for serving images (works regardless of bucket public/private status)
    // This avoids needing public URLs or signed URLs
    const url = `/api/assets/${key}`;

    return { characterHash, poseNumber, url, assetType: type };
  });

  return assets;
}

export async function getAvailableCharacterHashes(): Promise<string[]> {
  try {
    console.log('[R2] Listing character hashes from bucket:', R2_PUBLIC_BUCKET, 'prefix:', R2_CHARACTERS_PREFIX);
    const res = await listObjects(R2_PUBLIC_BUCKET, {
      prefix: R2_CHARACTERS_PREFIX,
      delimiter: '/',
    });
    console.log('[R2] Response:', {
      hasCommonPrefixes: !!(res.CommonPrefixes && res.CommonPrefixes.length > 0),
      prefixCount: res.CommonPrefixes?.length || 0,
      prefixes: res.CommonPrefixes?.map(p => p.Prefix).slice(0, 5)
    });
    const prefixes = (res.CommonPrefixes || []).map(p => (p.Prefix || ''));
    const hashes = prefixes
      .map(p => p.replace(R2_CHARACTERS_PREFIX, ''))
      .map(p => p.replace(/\/$/, ''))
      .filter(Boolean);
    console.log('[R2] Extracted', hashes.length, 'character hashes');
    return hashes;
  } catch (error: any) {
    console.error('[R2] Error listing character hashes:', {
      message: error?.message,
      name: error?.name,
      bucket: R2_PUBLIC_BUCKET,
      prefix: R2_CHARACTERS_PREFIX
    });
    throw error;
  }
}

export async function listR2Objects(prefix?: string): Promise<any[]> {
  const res = await listObjects(R2_PUBLIC_BUCKET, { prefix });
  return (res.Contents || []).map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified }));
}

/**
 * List order IDs from the orders bucket by finding all order directories
 * Orders are stored at: book-mvp-simple-adventure/orders/{orderId}/
 */
export async function getAvailableOrderIds(): Promise<string[]> {
  try {
    const PROJECT_NS = 'book-mvp-simple-adventure';
    const prefix = `${PROJECT_NS}/orders/`;
    console.log('[R2] Listing order IDs from bucket:', R2_ORDERS_BUCKET, 'prefix:', prefix);
    
    const res = await listObjects(R2_ORDERS_BUCKET, {
      prefix,
      delimiter: '/',
    });
    
    console.log('[R2] Orders response:', {
      hasCommonPrefixes: !!(res.CommonPrefixes && res.CommonPrefixes.length > 0),
      prefixCount: res.CommonPrefixes?.length || 0,
      prefixes: res.CommonPrefixes?.map(p => p.Prefix).slice(0, 5)
    });
    
    const prefixes = (res.CommonPrefixes || []).map(p => (p.Prefix || ''));
    const orderIds = prefixes
      .map(p => p.replace(prefix, ''))
      .map(p => p.replace(/\/$/, ''))
      .filter(Boolean);
    
    console.log('[R2] Extracted', orderIds.length, 'order IDs');
    return orderIds;
  } catch (error: any) {
    console.error('[R2] Error listing order IDs:', {
      message: error?.message,
      name: error?.name,
      bucket: R2_ORDERS_BUCKET
    });
    throw error;
  }
}

// Build manifest key for order-centric storage
export function buildManifestKey(orderId: string, stage: '2a' | '2b' | '3'): string {
  const PROJECT_NS = 'book-mvp-simple-adventure';
  return `${PROJECT_NS}/orders/${orderId}/manifests/${stage}-manifest.json`;
}

export async function downloadManifest(key: string): Promise<any> {
  const resp = await getObject(R2_ORDERS_BUCKET, key);
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

