/**
 * Shared Amazon SP-API infrastructure: config, LWA auth, SigV4 signing, generic caller.
 * Used by amazon-message-center.ts, amazon-shipment.ts, and any future SP-API integration.
 */

import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const spApiBaseSchema = z.object({
  lwaClientId: z.string().min(1, 'AMZ_APP_CLIENT_ID is required'),
  lwaClientSecret: z.string().min(1, 'AMZ_APP_CLIENT_SECRET is required'),
  lwaRefreshToken: z.string().min(1, 'AMZ_REFRESH_TOKEN is required'),
  sellerId: z.string().min(1, 'AMZ_SELLER_ID is required'),
  marketplaceId: z.string().min(1, 'AMZ_MARKETPLACE_ID is required').default('ATVPDKIKX0DER'),
  spRegion: z.string().min(1, 'AMZ_REGION is required').default('na'),
  awsAccessKeyId: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
  awsSecretAccessKey: z.string().min(1, 'AWS_SECRET_ACCESS_KEY is required'),
  awsRegion: z.string().min(1, 'AWS_REGION is required').default('us-east-1'),
});

export type AmazonSpApiConfig = z.infer<typeof spApiBaseSchema>;

export type SpApiConfigResult =
  | { ok: true; config: AmazonSpApiConfig }
  | { ok: false; error: string; issues: z.ZodIssue[] };

let cachedBaseConfig: AmazonSpApiConfig | null = null;

/** Load base SP-API config from env vars (auth-only, no messaging extras). */
export function getAmazonSpApiConfig(forceRefresh = false): SpApiConfigResult {
  if (!forceRefresh && cachedBaseConfig) {
    return { ok: true, config: cachedBaseConfig };
  }

  const parseResult = spApiBaseSchema.safeParse({
    lwaClientId: process.env.AMZ_APP_CLIENT_ID,
    lwaClientSecret: process.env.AMZ_APP_CLIENT_SECRET,
    lwaRefreshToken: process.env.AMZ_REFRESH_TOKEN,
    sellerId: process.env.AMZ_SELLER_ID,
    marketplaceId: process.env.AMZ_MARKETPLACE_ID,
    spRegion: process.env.AMZ_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION,
  });

  if (!parseResult.success) {
    return { ok: false, error: 'Amazon SP-API env configuration is incomplete', issues: parseResult.error.issues };
  }

  cachedBaseConfig = parseResult.data;
  return { ok: true, config: cachedBaseConfig };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AmazonSpApiError extends Error {
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, options: { retryable?: boolean; status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'AmazonSpApiError';
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

// ---------------------------------------------------------------------------
// LWA access token
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/o2/token';

interface AccessTokenCache { token: string; expiresAt: number; }

let accessTokenCache: AccessTokenCache | null = null;

export async function getAccessToken(config: AmazonSpApiConfig): Promise<string> {
  if (accessTokenCache && Date.now() < accessTokenCache.expiresAt - 60_000) {
    return accessTokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.lwaRefreshToken,
    client_id: config.lwaClientId,
    client_secret: config.lwaClientSecret,
  });

  console.log('[LWA Token] Requesting access token:', {
    endpoint: ACCESS_TOKEN_ENDPOINT,
    clientId: config.lwaClientId.substring(0, 20) + '...',
    refreshTokenPreview: config.lwaRefreshToken.substring(0, 20) + '...',
  });

  const response = await fetch(ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const responseText = await response.text();
  let data: any;
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = { raw: responseText }; }

  if (!response.ok) {
    const errorMessage = data.error_description || data.error || responseText || 'Unknown error';
    console.error('[LWA Token] Failed to get access token:', { status: response.status, error: errorMessage });
    throw new AmazonSpApiError(`Failed to obtain Amazon LWA access token: ${errorMessage}`, {
      retryable: response.status >= 500,
      status: response.status,
      details: data,
    });
  }

  if (!data.access_token || !data.expires_in) {
    throw new AmazonSpApiError('Amazon LWA response missing access token', { retryable: false, details: data });
  }

  accessTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Generic SP-API caller (SigV4 signing + full request/response logging)
// ---------------------------------------------------------------------------

const SERVICE = 'execute-api';

export interface CallSpApiOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  accessToken: string;
  config: AmazonSpApiConfig;
  body?: unknown;
  query?: Record<string, string | number | string[] | undefined>;
}

export async function callSellingPartnerApi(options: CallSpApiOptions) {
  const host = `sellingpartnerapi-${options.config.spRegion}.amazon.com`;
  const url = new URL(`https://${host}${options.path}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        value.forEach(v => { if (v != null) url.searchParams.append(key, String(v)); });
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  const method = options.method.toUpperCase();
  const bodyString = options.body ? JSON.stringify(options.body) : '';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Headers to sign
  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-access-token': options.accessToken,
  };
  if (method === 'POST' || method === 'PUT') headers['content-type'] = 'application/json';

  const payloadHash = createHash('sha256').update(bodyString || '').digest('hex');
  const canonicalQueryString = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k].trim()}`).join('\n');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [method, url.pathname, canonicalQueryString, `${canonicalHeaders}\n`, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${options.config.awsRegion}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

  const signingKey = getSignatureKey(options.config.awsSecretAccessKey, dateStamp, options.config.awsRegion, SERVICE);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${options.config.awsAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) requestHeaders.set(k, v);
  requestHeaders.set('user-agent', 'LittleHeroBooks/1.0 (Language=TypeScript/Node.js; Platform=Cloudflare)');
  if (process.env.AWS_SESSION_TOKEN) requestHeaders.set('x-amz-security-token', process.env.AWS_SESSION_TOKEN);

  // Capture request details for support logging
  const fullRequestDetails = {
    method, url: url.toString(), path: options.path,
    headers: Object.fromEntries(requestHeaders.entries()),
    body: bodyString || null, timestamp: amzDate,
    applicationId: options.config.lwaClientId, developerAccountId: options.config.sellerId,
    api: 'Selling Partner API', operation: options.path,
  };

  const response = await fetch(url.toString(), { method, headers: requestHeaders, body: bodyString || undefined });

  const responseStatus = response.status;
  const responseOk = response.ok;
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { responseHeaders[k] = v; });
  const requestId = responseHeaders['x-amzn-requestid'] || responseHeaders['x-amzn-RequestId'] || '';

  const text = await response.text().catch(() => '');
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  const apiCallDetails = {
    request: fullRequestDetails,
    response: { status: responseStatus, statusText: response.statusText, headers: responseHeaders, body: text, requestId, timestamp: amzDate },
    applicationId: options.config.lwaClientId, developerAccountId: options.config.sellerId,
    api: 'Selling Partner API', operation: options.path, timestamp: amzDate, requestId,
  };

  console.log('[Amazon SP-API] Full Request/Response Details for Support:', JSON.stringify({
    applicationId: apiCallDetails.applicationId, operation: apiCallDetails.operation,
    timestamp: apiCallDetails.timestamp, requestId: apiCallDetails.requestId,
    fullRequest: { method, url: url.toString(), path: options.path },
    fullResponse: { status: responseStatus, statusText: response.statusText },
  }, null, 2));

  // Clear token cache on 401 so next request gets a fresh LWA token
  if (responseStatus === 401) accessTokenCache = null;

  if (!responseOk) {
    console.error('[Amazon SP-API] Request failed:', JSON.stringify({
      status: responseStatus, url: url.toString(), path: options.path,
      errors: data?.errors, rawResponse: text.substring(0, 1000),
    }, null, 2));

    const errorMessage = data?.errors?.[0]?.message || data?.message || `Amazon SP-API request failed with status ${responseStatus}`;
    const errorCode = data?.errors?.[0]?.code;
    const errorDetailsStr = data?.errors?.[0]?.details ? ` Details: ${JSON.stringify(data.errors[0].details)}` : '';
    const detailedError = errorCode ? `${errorMessage} (Code: ${errorCode}${errorDetailsStr})` : errorMessage;

    const error = new AmazonSpApiError(detailedError, {
      retryable: responseStatus >= 500, status: responseStatus, code: errorCode, details: data,
    });
    (error as any).apiCallDetails = apiCallDetails;
    throw error;
  }

  (data as any).__apiCallDetails = apiCallDetails;
  return data;
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(regionName).digest();
  const kService = createHmac('sha256', kRegion).update(serviceName).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

// ---------------------------------------------------------------------------
// Resolve Amazon order ID (strips sibling suffix)
// ---------------------------------------------------------------------------

/**
 * Resolve the Amazon order ID for SP-API calls.
 * For sibling orders the DB stores a synthetic id like "114-xxx-item-152767221929961".
 * SP-API expects the parent order ID ("114-xxx").
 */
export function resolveAmazonOrderId(orderRecord: {
  amazon_order_id?: string | null;
  product_info?: unknown;
}): string | null {
  const raw = orderRecord.amazon_order_id ?? null;
  if (!raw) return null;

  let productInfo: Record<string, unknown> | null = null;
  if (orderRecord.product_info != null) {
    if (typeof orderRecord.product_info === 'string') {
      try { productInfo = JSON.parse(orderRecord.product_info) as Record<string, unknown>; } catch { productInfo = null; }
    } else if (typeof orderRecord.product_info === 'object' && orderRecord.product_info !== null) {
      productInfo = orderRecord.product_info as Record<string, unknown>;
    }
  }

  const parent = productInfo?._parent_amazon_order_id;
  if (typeof parent === 'string' && parent.trim()) return parent.trim();
  if (raw.includes('-item-')) return raw.substring(0, raw.indexOf('-item-'));
  return raw;
}
