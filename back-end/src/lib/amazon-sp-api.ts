/**
 * Shared Amazon SP-API infrastructure: config, LWA auth, SigV4 signing, generic caller.
 * Used by amazon-message-center.ts, amazon-shipment.ts, and any future SP-API integration.
 */

import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;
type SpApiJsonResponse = JsonRecord & {
  access_token?: string;
  expires_in?: number;
  error_description?: string;
  error?: string;
  errors?: Array<JsonRecord>;
  message?: string;
  __apiCallDetails?: unknown;
};

export const AMAZON_SP_API_ENV_ALIASES = {
  lwaClientId: {
    production: ['AMZ_LWA_CLIENT_ID_PROD', 'AMZ_APP_CLIENT_ID', 'AMAZON_SP_API_CLIENT_ID'],
    sandbox: ['AMZ_LWA_CLIENT_ID_SANDBOX', 'AMZ_APP_CLIENT_ID', 'AMAZON_SP_API_CLIENT_ID'],
  },
  lwaClientSecret: {
    production: ['AMZ_LWA_CLIENT_SECRET_PROD', 'AMZ_APP_CLIENT_SECRET', 'AMAZON_SP_API_CLIENT_SECRET'],
    sandbox: ['AMZ_LWA_CLIENT_SECRET_SANDBOX', 'AMZ_APP_CLIENT_SECRET', 'AMAZON_SP_API_CLIENT_SECRET'],
  },
  lwaRefreshToken: {
    production: ['AMZ_APP_PROD_REFRESH_TOKEN', 'AMZ_REFRESH_TOKEN', 'AMAZON_SP_API_REFRESH_TOKEN'],
    sandbox: ['AMZ_APP_SANDBOX_REFRESH_TOKEN', 'AMZ_REFRESH_TOKEN', 'AMAZON_SP_API_REFRESH_TOKEN'],
  },
  sellerId: {
    production: ['AMZ_SELLER_ID', 'AMAZON_SP_API_SELLER_ID'],
    sandbox: ['AMZ_SELLER_ID', 'AMAZON_SP_API_SELLER_ID'],
  },
  marketplaceId: {
    production: ['AMZ_MARKETPLACE_ID', 'AMAZON_SP_API_MARKETPLACE_ID'],
    sandbox: ['AMZ_MARKETPLACE_ID', 'AMAZON_SP_API_MARKETPLACE_ID'],
  },
  spRegion: {
    production: ['AMZ_REGION', 'AMAZON_SP_API_REGION'],
    sandbox: ['AMZ_REGION', 'AMAZON_SP_API_REGION'],
  },
  awsAccessKeyId: {
    production: ['AWS_ACCESS_KEY_ID'],
    sandbox: ['AWS_ACCESS_KEY_ID'],
  },
  awsSecretAccessKey: {
    production: ['AWS_SECRET_ACCESS_KEY'],
    sandbox: ['AWS_SECRET_ACCESS_KEY'],
  },
  awsRegion: {
    production: ['AWS_REGION'],
    sandbox: ['AWS_REGION'],
  },
} as const;

type AmazonSpApiEnvField = keyof typeof AMAZON_SP_API_ENV_ALIASES;

function isPlaceholderEnvValue(value: string): boolean {
  return /^your[_-]/i.test(value.trim()) || /^replace[_-]/i.test(value.trim());
}

function firstEnvValue(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value && !isPlaceholderEnvValue(value)) {
      return value;
    }
  }

  return undefined;
}

function parseJsonObject(text: string): SpApiJsonResponse {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as SpApiJsonResponse
      : { raw: text };
  } catch {
    return { raw: text };
  }
}

function aliasesFor(field: AmazonSpApiEnvField): readonly string[] {
  const mode = process.env.AMAZON_SANDBOX_MODE?.trim().toLowerCase() === 'true'
    ? 'sandbox'
    : 'production';
  return AMAZON_SP_API_ENV_ALIASES[field][mode];
}

function requiredEnvString(field: AmazonSpApiEnvField) {
  const message = `Set one of: ${aliasesFor(field).join(', ')}`;
  return z.string({ error: message }).min(1, message);
}

const spApiBaseSchema = z.object({
  lwaClientId: requiredEnvString('lwaClientId'),
  lwaClientSecret: requiredEnvString('lwaClientSecret'),
  lwaRefreshToken: requiredEnvString('lwaRefreshToken'),
  sellerId: requiredEnvString('sellerId'),
  marketplaceId: requiredEnvString('marketplaceId').default('ATVPDKIKX0DER'),
  spRegion: requiredEnvString('spRegion').default('na'),
  awsAccessKeyId: requiredEnvString('awsAccessKeyId'),
  awsSecretAccessKey: requiredEnvString('awsSecretAccessKey'),
  awsRegion: requiredEnvString('awsRegion').default('us-east-1'),
});

export type AmazonSpApiConfig = z.infer<typeof spApiBaseSchema>;

export type SpApiConfigResult =
  | { ok: true; config: AmazonSpApiConfig }
  | { ok: false; error: string; issues: z.ZodIssue[] };

let cachedBaseConfig: AmazonSpApiConfig | null = null;

export function resolveAmazonSpApiEnv(): Partial<Record<AmazonSpApiEnvField, string>> {
  return {
    lwaClientId: firstEnvValue(aliasesFor('lwaClientId')),
    lwaClientSecret: firstEnvValue(aliasesFor('lwaClientSecret')),
    lwaRefreshToken: firstEnvValue(aliasesFor('lwaRefreshToken')),
    sellerId: firstEnvValue(aliasesFor('sellerId')),
    marketplaceId: firstEnvValue(aliasesFor('marketplaceId')),
    spRegion: firstEnvValue(aliasesFor('spRegion')),
    awsAccessKeyId: firstEnvValue(aliasesFor('awsAccessKeyId')),
    awsSecretAccessKey: firstEnvValue(aliasesFor('awsSecretAccessKey')),
    awsRegion: firstEnvValue(aliasesFor('awsRegion')),
  };
}

/** Load base SP-API config from env vars (auth-only, no messaging extras). */
export function getAmazonSpApiConfig(forceRefresh = false): SpApiConfigResult {
  if (!forceRefresh && cachedBaseConfig) {
    return { ok: true, config: cachedBaseConfig };
  }

  const parseResult = spApiBaseSchema.safeParse(resolveAmazonSpApiEnv());

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
  public apiCallDetails?: unknown;

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
  const data = parseJsonObject(responseText);

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
  const data = parseJsonObject(text);

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
      errors: data.errors, rawResponse: text.substring(0, 1000),
    }, null, 2));

    const firstError = data.errors?.[0] ?? {};
    const errorMessage =
      (typeof firstError.message === 'string' ? firstError.message : null) ||
      data.message ||
      `Amazon SP-API request failed with status ${responseStatus}`;
    const errorCode = typeof firstError.code === 'string' ? firstError.code : undefined;
    const errorDetailsStr = firstError.details ? ` Details: ${JSON.stringify(firstError.details)}` : '';
    const detailedError = errorCode ? `${errorMessage} (Code: ${errorCode}${errorDetailsStr})` : errorMessage;

    const error = new AmazonSpApiError(detailedError, {
      retryable: responseStatus >= 500, status: responseStatus, code: errorCode, details: data,
    });
    error.apiCallDetails = apiCallDetails;
    throw error;
  }

  data.__apiCallDetails = apiCallDetails;
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
