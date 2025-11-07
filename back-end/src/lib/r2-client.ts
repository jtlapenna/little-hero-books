import { AwsClient } from 'aws4fetch';
import { XMLParser } from 'fast-xml-parser';

// R2 configuration from environment
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// Validate required environment variables
const missingVars: string[] = [];
if (!ACCOUNT_ID) missingVars.push('CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID');
if (!ACCESS_KEY_ID) missingVars.push('R2_ACCESS_KEY_ID');
if (!SECRET_ACCESS_KEY) missingVars.push('R2_SECRET_ACCESS_KEY');

// Create aws4fetch client for R2 (Cloudflare Workers compatible)
export const r2Client = new AwsClient({
  accessKeyId: ACCESS_KEY_ID || '',
  secretAccessKey: SECRET_ACCESS_KEY || '',
  service: 's3',
  region: 'auto',
});

// R2 endpoint base URL
const R2_ENDPOINT = ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : '';

// XML parser for S3 ListObjectsV2 responses
// Configure to handle arrays properly (S3 may return single or multiple Contents/CommonPrefixes)
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseAttributeValue: true,
  isArray: (name, jPath) => {
    // Always treat Contents and CommonPrefixes as arrays (even if single element)
    return name === 'Contents' || name === 'CommonPrefixes';
  },
});

// Export validation helper (same interface as r2-config.ts)
export function validateR2Config(): { valid: boolean; missing: string[] } {
  return {
    valid: missingVars.length === 0,
    missing: missingVars,
  };
}

// Export bucket names and prefix (same as r2-config.ts)
export const R2_PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET_NAME || process.env.R2_ASSETS_BUCKET_NAME || process.env.R2_PUBLIC_BUCKET || 'little-hero-assets';
export const R2_ORDERS_BUCKET = process.env.R2_ORDERS_BUCKET_NAME || process.env.R2_ORDERS_BUCKET || 'little-hero-orders';
export const R2_CHARACTERS_PREFIX = process.env.R2_CHARACTERS_PREFIX || 'book-mvp-simple-adventure/order-generated-assets/characters/';

/**
 * ListObjectsV2 response structure (parsed from XML)
 */
export interface ListObjectsV2Response {
  ListBucketResult: {
    IsTruncated?: boolean;
    Contents?: Array<{
      Key: string;
      LastModified?: string;
      ETag?: string;
      Size?: number;
      StorageClass?: string;
    }>;
    CommonPrefixes?: Array<{
      Prefix: string;
    }>;
    KeyCount?: number;
    MaxKeys?: number;
    Prefix?: string;
    Delimiter?: string;
    NextContinuationToken?: string;
  };
}

/**
 * List objects in an R2 bucket (S3-compatible ListObjectsV2)
 * @param bucket - Bucket name
 * @param prefix - Optional prefix filter
 * @param delimiter - Optional delimiter for grouping (e.g., '/' for folders)
 * @param maxKeys - Maximum number of keys to return
 * @param continuationToken - Token for pagination
 */
export async function listObjects(
  bucket: string,
  options: {
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
    continuationToken?: string;
  } = {}
): Promise<ListObjectsV2Response['ListBucketResult']> {
  // Validate configuration
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }
  
  const { prefix, delimiter, maxKeys, continuationToken } = options;
  
  // Build query parameters for ListObjectsV2
  const params = new URLSearchParams({
    'list-type': '2',
  });
  
  if (prefix) params.set('prefix', prefix);
  if (delimiter) params.set('delimiter', delimiter);
  if (maxKeys) params.set('max-keys', String(maxKeys));
  if (continuationToken) params.set('continuation-token', continuationToken);
  
  // Use subdomain-style addressing (required for private buckets)
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com?${params.toString()}`;
  
  // For direct API calls, we need to sign the request manually
  // Unlike presigned URLs (which sign query params), direct calls sign headers
  const unsignedRequest = new Request(url, {
    method: 'GET',
  });
  
  // Sign the request (default behavior signs headers, not query params)
  const signedRequest = await r2Client.sign(unsignedRequest);
  
  // Fetch the signed request
  const response = await fetch(signedRequest);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`R2 listObjects failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  // Parse XML response
  const xmlText = await response.text();
  const parsed = xmlParser.parse(xmlText) as ListObjectsV2Response;
  
  const result = parsed.ListBucketResult;
  
  // Normalize arrays (ensure Contents and CommonPrefixes are always arrays)
  if (result.Contents && !Array.isArray(result.Contents)) {
    result.Contents = [result.Contents];
  }
  if (result.CommonPrefixes && !Array.isArray(result.CommonPrefixes)) {
    result.CommonPrefixes = [result.CommonPrefixes];
  }
  
  return result;
}

/**
 * Encode S3/R2 key for URL (preserve slashes, encode other special chars)
 */
function encodeS3Key(key: string): string {
  // Split by /, encode each segment, rejoin to preserve slashes
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * Get an object from R2 bucket
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Response with body that can be read as text/JSON/blob
 */
export async function getObject(bucket: string, key: string): Promise<Response> {
  // Validate configuration
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }
  
  // Build R2 URL with subdomain-style addressing (required for private buckets)
  // Format: https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}
  // Encode key while preserving slashes
  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  
  console.log('[R2 getObject] Debug:', {
    bucket,
    key,
    encodedKey,
    url,
    accountId: ACCOUNT_ID?.substring(0, 8) + '...',
    hasCredentials: !!(ACCESS_KEY_ID && SECRET_ACCESS_KEY),
  });
  
  // For direct API calls, we need to sign the request manually
  // Unlike presigned URLs (which sign query params), direct calls sign headers
  // CRITICAL: The Host header must be explicitly set and included in signed headers
  const urlObj = new URL(url);
  const unsignedRequest = new Request(url, {
    method: 'GET',
    headers: {
      'Host': urlObj.hostname, // Explicitly set Host header for signing
    },
  });
  
  console.log('[R2 getObject] Unsigned request:', {
    method: unsignedRequest.method,
    url: unsignedRequest.url,
    hostname: urlObj.hostname,
    headers: Object.fromEntries(unsignedRequest.headers.entries()),
  });
  
  // Sign the request (default behavior signs headers, not query params)
  // The Host header will be included in the signature
  const signedRequest = await r2Client.sign(unsignedRequest);
  
  // Log signed request details (but don't log Authorization header value for security)
  const signedHeaders: Record<string, string> = {};
  signedRequest.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'authorization') {
      signedHeaders[key] = value.substring(0, 20) + '...' + value.substring(value.length - 10);
    } else {
      signedHeaders[key] = value;
    }
  });
  
  console.log('[R2 getObject] Signed request:', {
    method: signedRequest.method,
    url: signedRequest.url,
    headers: signedHeaders,
    hasAuthHeader: signedRequest.headers.has('Authorization'),
    authHeaderLength: signedRequest.headers.get('Authorization')?.length || 0,
  });
  
  // Fetch the signed request
  const response = await fetch(signedRequest);
  
  console.log('[R2 getObject] Response:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[R2 getObject] Error response body:', errorText.substring(0, 500));
    throw new Error(`R2 getObject failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response;
}

/**
 * Put (upload) an object to R2 bucket
 * @param bucket - Bucket name
 * @param key - Object key
 * @param body - File body (Blob, ArrayBuffer, or ReadableStream)
 * @param contentType - Content type (e.g., 'image/png')
 * @returns Response from R2
 */
export async function putObject(
  bucket: string,
  key: string,
  body: Blob | ArrayBuffer | ReadableStream | string,
  contentType?: string
): Promise<Response> {
  // Validate configuration
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }
  
  // Build R2 URL with subdomain-style addressing (required for private buckets)
  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  
  console.log('[R2 putObject] Uploading:', {
    bucket,
    key,
    encodedKey,
    url,
    contentType,
    accountId: ACCOUNT_ID?.substring(0, 8) + '...',
    hasCredentials: !!(ACCESS_KEY_ID && SECRET_ACCESS_KEY),
  });
  
  // Build request with body and content type
  const headers: HeadersInit = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  
  const urlObj = new URL(url);
  const unsignedRequest = new Request(url, {
    method: 'PUT',
    headers: {
      'Host': urlObj.hostname,
      ...headers,
    },
    body: body,
  });
  
  // Sign the request
  const signedRequest = await r2Client.sign(unsignedRequest);
  
  // Fetch the signed request
  const response = await fetch(signedRequest);
  
  console.log('[R2 putObject] Response:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[R2 putObject] Error response body:', errorText.substring(0, 500));
    throw new Error(`R2 putObject failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response;
}

/**
 * Delete an object from R2 bucket
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Response from R2
 */
export async function deleteObject(bucket: string, key: string): Promise<Response> {
  // Validate configuration
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }
  
  // Build R2 URL with subdomain-style addressing (required for private buckets)
  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  
  console.log('[R2 deleteObject] Deleting:', {
    bucket,
    key,
    encodedKey,
    url,
    accountId: ACCOUNT_ID?.substring(0, 8) + '...',
    hasCredentials: !!(ACCESS_KEY_ID && SECRET_ACCESS_KEY),
  });
  
  const urlObj = new URL(url);
  const unsignedRequest = new Request(url, {
    method: 'DELETE',
    headers: {
      'Host': urlObj.hostname,
    },
  });
  
  // Sign the request
  const signedRequest = await r2Client.sign(unsignedRequest);
  
  // Fetch the signed request
  const response = await fetch(signedRequest);
  
  console.log('[R2 deleteObject] Response:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[R2 deleteObject] Error response body:', errorText.substring(0, 500));
    throw new Error(`R2 deleteObject failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response;
}

/**
 * Generate a signed URL for an R2 object (for public access)
 * Note: aws4fetch doesn't have built-in presigning, so we'll use the client's fetch method
 * For temporary signed URLs, we'd need to implement presigning manually or use a different approach
 * For now, this returns a URL that requires authentication via the client
 */
export function getObjectUrl(bucket: string, key: string): string {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }
  // Use subdomain-style addressing (required for private buckets)
  return `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeS3Key(key)}`;
}

