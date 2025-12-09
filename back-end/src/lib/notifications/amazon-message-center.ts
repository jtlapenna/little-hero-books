import { createCipheriv, createHash, createHmac, randomUUID } from 'crypto';

import { z } from 'zod';

type ReminderType = 'initial' | 'reminder-day-1' | 'reminder-day-2' | 'auto-approval';

const amazonMessagingEnvSchema = z.object({
  lwaClientId: z.string().min(1, 'AMZ_APP_CLIENT_ID is required'),
  lwaClientSecret: z.string().min(1, 'AMZ_APP_CLIENT_SECRET is required'),
  lwaRefreshToken: z.string().min(1, 'AMZ_REFRESH_TOKEN is required'),
  sellerId: z.string().min(1, 'AMZ_SELLER_ID is required'),
  marketplaceId: z.string().min(1, 'AMZ_MARKETPLACE_ID is required').default('ATVPDKIKX0DER'),
  spRegion: z.string().min(1, 'AMZ_REGION is required').default('na'),
  awsAccessKeyId: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
  awsSecretAccessKey: z.string().min(1, 'AWS_SECRET_ACCESS_KEY is required'),
  awsRegion: z.string().min(1, 'AWS_REGION is required').default('us-east-1'),
  customerSiteUrl: z
    .string()
    .url('CUSTOMER_SITE_URL must be a valid URL')
    .default('https://littleherolabs.com'),
  autoApprovalHours: z.coerce.number().int().positive().default(72)
});

export type AmazonMessagingConfig = z.infer<typeof amazonMessagingEnvSchema>;

export type AmazonMessagingConfigResult =
  | { ok: true; config: AmazonMessagingConfig }
  | { ok: false; error: string; issues: z.ZodIssue[] };

let cachedConfig: AmazonMessagingConfig | null = null;

export function getAmazonMessagingConfig(forceRefresh = false): AmazonMessagingConfigResult {
  if (!forceRefresh && cachedConfig) {
    return { ok: true, config: cachedConfig };
  }

  const parseResult = amazonMessagingEnvSchema.safeParse({
    lwaClientId: process.env.AMZ_APP_CLIENT_ID,
    lwaClientSecret: process.env.AMZ_APP_CLIENT_SECRET,
    lwaRefreshToken: process.env.AMZ_REFRESH_TOKEN,
    sellerId: process.env.AMZ_SELLER_ID,
    marketplaceId: process.env.AMZ_MARKETPLACE_ID,
    spRegion: process.env.AMZ_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION,
    customerSiteUrl: process.env.CUSTOMER_SITE_URL,
    autoApprovalHours: process.env.PREVIEW_AUTO_APPROVAL_HOURS
  });

  if (!parseResult.success) {
    return {
      ok: false,
      error: 'Amazon Message Center env configuration is incomplete',
      issues: parseResult.error.issues
    };
  }

  cachedConfig = parseResult.data;
  return { ok: true, config: cachedConfig };
}

interface BuildPreviewMessageOptions {
  reminderType: ReminderType;
  previewUrl: string;
  childName?: string;
  revisionsRemaining: number;
}

export function buildPreviewMessageHtml(options: BuildPreviewMessageOptions): string {
  const { reminderType, previewUrl, childName = 'your child', revisionsRemaining } = options;

  const reminders: Record<ReminderType, string> = {
    initial: 'Your personalized storybook preview is ready.',
    'reminder-day-1': 'Friendly reminder: please review your story within the next two days.',
    'reminder-day-2': 'Final reminder: automatic approval fires tomorrow unless you request a revision.',
    'auto-approval':
      'Action completed: we approved your story automatically so production can begin right away.'
  };

  const revisionLine =
    revisionsRemaining > 0
      ? `You have <strong>${revisionsRemaining}</strong> free revision${
          revisionsRemaining === 1 ? '' : 's'
        } remaining.`
      : 'You have used both free revisions. To request further changes, reply to this message or email hello@littleherobooks.com.';

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>Little Hero Books Preview for ${childName}</title>`,
    '<style>',
    'body { font-family: Arial, sans-serif; background: #f7f9fb; color: #1f2933; padding: 24px; }',
    '.card { background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(31, 41, 51, 0.1); }',
    '.cta { display: inline-block; padding: 12px 20px; background: #f9786b; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0; }',
    '.meta { font-size: 12px; color: #52606d; margin-top: 24px; }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="card">',
    '<h1>Little Hero Books – Preview Ready</h1>',
    `<p>${reminders[reminderType]}</p>`,
    `<p>Tap below to review <strong>${childName}</strong>'s Adventure Compass story:</p>`,
    `<p><a class="cta" href="${previewUrl}" target="_blank" rel="noopener noreferrer">Review Book Preview</a></p>`,
    `<p>${revisionLine}</p>`,
    '<p>If we do not hear from you within three days, we will approve the story automatically and move it into production.</p>',
    '<p>Need help? Reply to this message or email hello@littleherobooks.com.</p>',
    '<p class="meta">Every child is the hero of their own story.<br />Little Hero Books</p>',
    '</div>',
    '</body>',
    '</html>'
  ].join('');
}

interface SendPreviewMessageParams {
  amazonOrderId: string;
  reminderType: ReminderType;
  previewUrl: string;
  childName?: string;
  revisionsRemaining: number;
}

export interface AmazonMessagingResponse {
  success: boolean;
  messageId?: string;
  documentId?: string;
  error?: string;
  issues?: z.ZodIssue[];
  retryable?: boolean;
}

class AmazonMessagingError extends Error {
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, options: { retryable?: boolean; status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'AmazonMessagingError';
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

const ACCESS_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/o2/token';

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

let accessTokenCache: AccessTokenCache | null = null;

const SERVICE = 'execute-api';

export async function sendAmazonPreviewMessage(
  params: SendPreviewMessageParams
): Promise<AmazonMessagingResponse> {
  const configResult = getAmazonMessagingConfig();

  if (!configResult.ok) {
    return {
      success: false,
      error: configResult.error,
      issues: configResult.issues
    };
  }

  const html = buildPreviewMessageHtml(params);

  try {
    const config = configResult.config;
    const accessToken = await getAccessToken(config);

    await ensureMessageTypeAllowed({
      amazonOrderId: params.amazonOrderId,
      accessToken,
      config
    });

    const { documentId } = await uploadHtmlDocument({
      html,
      accessToken,
      config,
      reminderType: params.reminderType
    });

    const messageResponse = await sendConfirmCustomizationDetails({
      amazonOrderId: params.amazonOrderId,
      accessToken,
      config,
      documentId,
      reminderType: params.reminderType
    });

    return {
      success: true,
      messageId: messageResponse.messageId,
      documentId: documentId
    };
  } catch (error) {
    if (error instanceof AmazonMessagingError) {
      return {
        success: false,
        error: error.message,
        retryable: error.retryable
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected Amazon messaging error'
    };
  }
}

interface EnsureMessageTypeAllowedOptions {
  amazonOrderId: string;
  accessToken: string;
  config: AmazonMessagingConfig;
}

async function ensureMessageTypeAllowed(options: EnsureMessageTypeAllowedOptions) {
  const response = await callSellingPartnerApi({
    method: 'GET',
    path: `/messaging/v1/orders/${options.amazonOrderId}`,
    accessToken: options.accessToken,
    config: options.config
  });

  const availableActions = Array.isArray(response?.payload?.availableActions)
    ? response.payload.availableActions
    : [];

  const actions: string[] = availableActions
    .map((action: any) => {
      if (typeof action === 'string') {
        return action;
      }
      if (action && typeof action === 'object') {
        return action.name || action.code || action.action;
      }
      return undefined;
    })
    .filter((value): value is string => typeof value === 'string');

  if (!actions.includes('confirmCustomizationDetails')) {
    throw new AmazonMessagingError('Amazon does not allow confirmCustomizationDetails for this order', {
      retryable: false,
      details: { actions }
    });
  }
}

interface UploadHtmlDocumentOptions {
  html: string;
  accessToken: string;
  config: AmazonMessagingConfig;
  reminderType: ReminderType;
}

async function uploadHtmlDocument(options: UploadHtmlDocumentOptions) {
  const htmlBuffer = Buffer.from(options.html, 'utf8');

  const createResponse = await callSellingPartnerApi({
    method: 'POST',
    path: '/uploads/v1/documents',
    accessToken: options.accessToken,
    config: options.config,
    body: {
      contentType: 'text/html; charset=UTF-8',
      contentLength: htmlBuffer.length,
      marketplaceIds: [options.config.marketplaceId]
    }
  });

  const payload = createResponse?.payload;
  if (!payload) {
    throw new AmazonMessagingError('Amazon uploads API returned empty payload', {
      retryable: true,
      details: createResponse
    });
  }

  const uploadDestination = payload.uploadDestination;

  const documentId: string =
    payload.documentId || payload.uploadDestinationId || uploadDestination?.documentId;
  if (!documentId) {
    throw new AmazonMessagingError('Amazon uploads API response missing documentId', {
      retryable: true,
      details: payload
    });
  }

  const uploadUrl: string =
    payload.url || payload.uploadDestinationUrl || uploadDestination?.url;
  if (!uploadUrl) {
    throw new AmazonMessagingError('Amazon uploads API response missing upload URL', {
      retryable: true,
      details: payload
    });
  }

  const encryptionDetails = payload.encryptionDetails || uploadDestination?.encryptionDetails;
  if (!encryptionDetails) {
    throw new AmazonMessagingError('Amazon uploads API response missing encryption details', {
      retryable: true,
      details: payload
    });
  }

  const encryptedBuffer = encryptHtml(htmlBuffer, encryptionDetails);
  const md5Checksum = createHash('md5').update(encryptedBuffer).digest('base64');

  const headers: Record<string, string> = {};

  const requiredHeaders = payload.headers || uploadDestination?.headers;
  if (requiredHeaders && typeof requiredHeaders === 'object') {
    for (const [key, value] of Object.entries(requiredHeaders)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }
  }

  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/octet-stream';
  }

  headers['Content-MD5'] = md5Checksum;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: encryptedBuffer
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => undefined);
    throw new AmazonMessagingError('Failed to upload encrypted document to Amazon', {
      retryable: uploadResponse.status >= 500,
      status: uploadResponse.status,
      details: text
    });
  }

  return { documentId };
}

function encryptHtml(htmlBuffer: Buffer, encryptionDetails: any) {
  const key = Buffer.from(encryptionDetails.key, 'base64');
  const iv = Buffer.from(encryptionDetails.initializationVector, 'base64');

  if (key.length !== 32 || iv.length !== 16) {
    throw new AmazonMessagingError('Invalid encryption key/IV length returned by Amazon uploads API', {
      retryable: false
    });
  }

  const cipher = createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(htmlBuffer), cipher.final()]);
}

interface SendConfirmCustomizationDetailsOptions {
  amazonOrderId: string;
  accessToken: string;
  config: AmazonMessagingConfig;
  documentId: string;
  reminderType: ReminderType;
}

async function sendConfirmCustomizationDetails(options: SendConfirmCustomizationDetailsOptions) {
  const response = await callSellingPartnerApi({
    method: 'POST',
    path: `/messaging/v1/orders/${options.amazonOrderId}/messages/confirmCustomizationDetails`,
    accessToken: options.accessToken,
    config: options.config,
    body: {
      attachments: [
        {
          attachmentType: 'CUSTOMIZATION_DETAILS',
          contentType: 'text/html; charset=UTF-8',
          fileName: buildAttachmentFileName(options.reminderType),
          documentId: options.documentId
        }
      ]
    }
  });

  const messageId = response?.payload?.messageId || randomUUID();

  return {
    messageId
  };
}

function buildAttachmentFileName(reminderType: ReminderType) {
  const suffix = reminderType.replace(/[^a-z0-9-]/gi, '-');
  return `little-hero-preview-${suffix || 'initial'}.html`;
}

interface CallSpApiOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  accessToken: string;
  config: AmazonMessagingConfig;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function callSellingPartnerApi(options: CallSpApiOptions) {
  const host = `sellingpartnerapi-${options.config.spRegion}.amazon.com`;
  const endpoint = `https://${host}${options.path}`;
  const url = new URL(endpoint);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  const method = options.method.toUpperCase();
  const bodyString = options.body ? JSON.stringify(options.body) : '';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-access-token': options.accessToken
  };

  if (method === 'POST' || method === 'PUT') {
    headers['content-type'] = 'application/json';
  }

  const payloadHash = createHash('sha256').update(bodyString || '').digest('hex');

  const canonicalUri = url.pathname;
  const canonicalQueryString = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${headers[key].trim()}`)
    .join('\n');

  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${options.config.awsRegion}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSignatureKey(options.config.awsSecretAccessKey, dateStamp, options.config.awsRegion, SERVICE);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${options.config.awsAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  headers.authorization = authorizationHeader;

  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }

  if (process.env.AWS_SESSION_TOKEN) {
    requestHeaders.set('x-amz-security-token', process.env.AWS_SESSION_TOKEN);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: bodyString || undefined
  });

  const text = await response.text().catch(() => '');
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    // Log FULL error details for troubleshooting - this is critical for diagnosis
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      url: url.toString(),
      method: method,
      path: options.path,
      errorData: data,
      errors: data?.errors,
      firstError: data?.errors?.[0],
      rawResponse: text.substring(0, 1000), // First 1000 chars
      allErrorCodes: data?.errors?.map((e: any) => e.code) || [],
      allErrorMessages: data?.errors?.map((e: any) => e.message) || []
    };
    
    console.error('[Amazon SP-API] Request failed - FULL DETAILS:', JSON.stringify(errorDetails, null, 2));

    const errorMessage =
      data?.errors?.[0]?.message ||
      data?.message ||
      `Amazon SP-API request failed with status ${response.status}`;

    // Include ALL error details in the error message for frontend display
    const errorCode = data?.errors?.[0]?.code;
    const errorDetailsStr = data?.errors?.[0]?.details 
      ? ` Details: ${JSON.stringify(data.errors[0].details)}`
      : '';
    
    const detailedError = errorCode 
      ? `${errorMessage} (Code: ${errorCode}${errorDetailsStr})`
      : errorMessage;

    throw new AmazonMessagingError(detailedError, {
      retryable: response.status >= 500,
      status: response.status,
      code: errorCode,
      details: data,
      url: url.toString(),
      path: options.path
    });
  }

  return data;
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(regionName).digest();
  const kService = createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

async function getAccessToken(config: AmazonMessagingConfig): Promise<string> {
  if (accessTokenCache && Date.now() < accessTokenCache.expiresAt - 60_000) {
    return accessTokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.lwaRefreshToken,
    client_id: config.lwaClientId,
    client_secret: config.lwaClientSecret
  });

  const response = await fetch(ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text().catch(() => undefined);
    throw new AmazonMessagingError('Failed to obtain Amazon LWA access token', {
      retryable: response.status >= 500,
      status: response.status,
      details: text
    });
  }

  const data = await response.json();

  if (!data.access_token || !data.expires_in) {
    throw new AmazonMessagingError('Amazon LWA response missing access token', {
      retryable: false,
      details: data
    });
  }

  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };

  return data.access_token;
}

