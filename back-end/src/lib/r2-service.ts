import { listObjects, getObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET, R2_CHARACTERS_PREFIX } from './r2-client';
import { AwsClient } from 'aws4fetch';

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
 * Uses aws4fetch which is compatible with Cloudflare Workers runtime (Web Crypto API).
 * 
 * @param key - R2 object key (e.g., 'book-mvp-simple-adventure/backgrounds/page01.png')
 * @param bucket - Bucket name (defaults to R2_PUBLIC_BUCKET)
 * @param expiresIn - Expiration time in seconds (defaults to 3600 = 1 hour)
 * @returns Signed URL string
 * 
 * @example
 * const url = await getSignedUrlForObject('book-mvp-simple-adventure/backgrounds/page01.png', 'little-hero-assets', 3600);
 */
// Helper functions using Web Crypto API (Cloudflare Workers compatible)
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: string | Uint8Array, data: string, returnHex: boolean = true): Promise<string | Uint8Array> {
  const encoder = new TextEncoder();
  let keyData: Uint8Array;
  
  if (typeof key === 'string') {
    // If it's a hex string (from previous HMAC), decode it
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      keyData = new Uint8Array(key.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
      // Regular string, encode as UTF-8
      keyData = encoder.encode(key);
    }
  } else {
    // Ensure Uint8Array has a proper ArrayBuffer (not SharedArrayBuffer)
    keyData = new Uint8Array(key);
  }
  
  const dataBuffer = encoder.encode(data);
  
  // Ensure we have a proper ArrayBuffer (not SharedArrayBuffer)
  const keyBuffer = keyData.buffer instanceof ArrayBuffer 
    ? keyData.buffer 
    : new Uint8Array(keyData).buffer;
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  const signatureArray = new Uint8Array(signature);
  
  if (returnHex) {
    return Array.from(signatureArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return signatureArray;
}

export async function getSignedUrlForObject(
  key: string,
  bucket: string = R2_PUBLIC_BUCKET,
  expiresIn: number = 3600
): Promise<string> {
  try {
    // Get R2 credentials from environment variables
    const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
    const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
    const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    
    if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
      throw new Error('Missing R2 credentials. Required: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }
    
    // Use aws4fetch per Cloudflare documentation: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
    // R2 requires 's3' service and 'auto' region
    const client = new AwsClient({
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
    
    // R2 uses SUBDOMAIN format: https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}
    // Per Cloudflare docs example
    const url = new URL(
      `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`
    );
    
    // Set expiration parameter before signing (required for presigned URLs)
    url.searchParams.set('X-Amz-Expires', expiresIn.toString());
    
    // Sign the URL with query parameters (presigned URL)
    // signQuery: true tells aws4fetch to sign the query parameters instead of headers
    const signedRequest = await client.sign(
      new Request(url.toString(), {
        method: 'GET',
      }),
      {
        aws: { signQuery: true },
      }
    );
    
    // Return the signed URL
    return signedRequest.url;
  } catch (error: any) {
    console.error(`[R2 Service] Error generating signed URL for ${bucket}/${key}:`, error);
    throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`);
  }
}

