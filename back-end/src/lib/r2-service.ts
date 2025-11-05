import { listObjects, getObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET, R2_CHARACTERS_PREFIX } from './r2-client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from './r2-config';

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
    const lowerFile = file.toLowerCase();
    
    // Determine asset type:
    // 1. Files in /poses/ directory are always "original" (2A images)
    // 2. Files with "nobg" in filename are "background-removed" (2B images)
    // 3. Files with "bg-removed" or "background-removed" are "background-removed"
    // 4. Files with "final" are "final"
    // 5. Otherwise, "original"
    const isInPosesDir = lower.includes('/poses/');
    const type: CharacterAsset['assetType'] = lower.includes('final')
      ? 'final'
      : isInPosesDir
        ? 'original'  // Files in poses/ directory are always original (2A)
        : (lowerFile.includes('nobg') || lower.includes('bg-removed') || lower.includes('background-removed'))
          ? 'background-removed'  // Files in parent dir with nobg.png are background-removed (2B)
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

/**
 * Generate a signed URL for an R2 object
 * 
 * This function is used by n8n workflows and external services (like Bria API)
 * to get temporary access to R2 objects when buckets are private.
 * 
 * @param key - R2 object key (e.g., 'book-mvp-simple-adventure/backgrounds/page01.png')
 * @param bucket - Bucket name (defaults to R2_PUBLIC_BUCKET)
 * @param expiresIn - Expiration time in seconds (defaults to 3600 = 1 hour)
 * @returns Signed URL string
 * 
 * @example
 * const url = await getSignedUrlForObject('book-mvp-simple-adventure/backgrounds/page01.png', 'little-hero-assets', 3600);
 */
export async function getSignedUrlForObject(
  key: string,
  bucket: string = R2_PUBLIC_BUCKET,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn });
    return signedUrl;
  } catch (error: any) {
    console.error(`[R2 Service] Error generating signed URL for ${bucket}/${key}:`, error);
    throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`);
  }
}

