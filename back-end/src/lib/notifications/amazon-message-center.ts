import { createCipheriv, createHash, createHmac, randomUUID } from 'crypto';

import { z } from 'zod';

import { buildApprovalPageHtml } from '@/lib/approval-page-html';

// Amazon Messaging API - Updated to parse _links.actions correctly
// Deployment trigger

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
  // Always force refresh to avoid stale cached config after env var updates
  // In production, env vars can change without code redeploy, so we should always read fresh
  if (!forceRefresh && cachedConfig) {
    // Log what we're returning from cache for debugging
    console.log('[Amazon Config] Using cached config (forceRefresh=false). Client ID ends with:', cachedConfig.lwaClientId?.slice(-8));
    return { ok: true, config: cachedConfig };
  }

  // Log raw env var values for debugging
  const rawClientId = process.env.AMZ_APP_CLIENT_ID || '';
  console.log('[Amazon Config] Reading fresh config. Raw AMZ_APP_CLIENT_ID ends with:', rawClientId.slice(-8));

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

interface SendPreviewMessageParams {
  amazonOrderId: string;
  reminderType: ReminderType;
  previewUrl: string;
  childName?: string;
  revisionsRemaining: number;
  /** When true, use HTML path (confirmCustomizationDetails) if available. Test endpoint can pass ?forceHtml=true. */
  forceHtml?: boolean;
}

export interface AmazonMessagingResponse {
  success: boolean;
  messageId?: string;
  documentId?: string;
  messageType?: 'confirmCustomizationDetails' | 'createConfirmOrderDetails';
  error?: string;
  issues?: z.ZodIssue[];
  retryable?: boolean;
  details?: unknown;
}

/**
 * Resolve the Amazon order ID to use for the Messaging API.
 * For sibling orders (second+ item in same Amazon order), the DB stores a synthetic
 * amazon_order_id like "114-xxx-item-152767221929961". The Messaging API expects
 * the parent order ID ("114-xxx"). This returns the parent when applicable.
 */
export function getAmazonOrderIdForMessaging(orderRecord: {
  amazon_order_id?: string | null;
  product_info?: unknown;
}): string | null {
  const raw = orderRecord.amazon_order_id ?? null;
  if (!raw) return null;
  let productInfo: Record<string, unknown> | null = null;
  if (orderRecord.product_info != null) {
    if (typeof orderRecord.product_info === 'string') {
      try {
        productInfo = JSON.parse(orderRecord.product_info) as Record<string, unknown>;
      } catch {
        productInfo = null;
      }
    } else if (typeof orderRecord.product_info === 'object' && orderRecord.product_info !== null) {
      productInfo = orderRecord.product_info as Record<string, unknown>;
    }
  }
  const parent = productInfo?._parent_amazon_order_id;
  if (typeof parent === 'string' && parent.trim()) return parent.trim();
  if (raw.includes('-item-')) return raw.substring(0, raw.indexOf('-item-'));
  return raw;
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

  // Reuse same approval page HTML as tab 3 (Post-PDF) download; includes correct preview URL
  const html = buildApprovalPageHtml(
    params.previewUrl,
    params.childName ?? 'your child',
    params.amazonOrderId
  );

  try {
    const config = configResult.config;
    const accessToken = await getAccessToken(config);

    // Check which message types are available for this order
    const messageTypeCheck = await checkAvailableMessageTypes({
      amazonOrderId: params.amazonOrderId,
      accessToken,
      config,
      forceHtml: params.forceHtml
    });

    // Capture API call details for export
    const apiCallDetails = messageTypeCheck.apiCallDetails;

    if (!messageTypeCheck.allowedType) {
      return {
        success: false,
        error: `No suitable messaging action available for this order. Available actions: ${messageTypeCheck.availableActions.join(', ') || 'none'}`,
        details: {
          availableActions: messageTypeCheck.availableActions,
          rawResponse: messageTypeCheck.rawResponse
        },
        apiCallDetails // Include for export
      };
    }

    console.log('[Amazon Messaging] Using message type:', messageTypeCheck.allowedType);

    // Upload HTML document (only needed for confirmCustomizationDetails)
    let documentId: string | undefined;
    if (messageTypeCheck.allowedType === 'confirmCustomizationDetails') {
      const uploadResult = await uploadHtmlDocument({
        amazonOrderId: params.amazonOrderId,
        html,
        accessToken,
        config,
        reminderType: params.reminderType
      });
      documentId = uploadResult.documentId;
    }

    // Send the appropriate message type
    let messageResponse;
    if (messageTypeCheck.allowedType === 'confirmCustomizationDetails') {
      const rawMessageBody =
        `Your book preview is ready. Open the attached file and click the link to review and approve, or copy this link: ${params.previewUrl}. Please respond within 3 days or we'll approve automatically and begin printing.`;
      messageResponse = await sendConfirmCustomizationDetails({
        amazonOrderId: params.amazonOrderId,
        accessToken,
        config,
        documentId: documentId!,
        reminderType: params.reminderType,
        rawMessageBody
      });
    } else {
      // Use createConfirmOrderDetails as fallback
      messageResponse = await sendConfirmOrderDetails({
      amazonOrderId: params.amazonOrderId,
      accessToken,
      config,
        previewUrl: params.previewUrl,
        childName: params.childName,
      reminderType: params.reminderType
    });
    }

    return {
      success: true,
      messageId: messageResponse.messageId,
      documentId: documentId,
      messageType: messageTypeCheck.allowedType,
      apiCallDetails // Include for export
    };
  } catch (error) {
    if (error instanceof AmazonMessagingError) {
      // Extract apiCallDetails from error for export (SP-API failures); LWA failures have .details
      const apiCallDetails = (error as any).apiCallDetails || null;
      return {
        success: false,
        error: error.message,
        retryable: error.retryable,
        apiCallDetails,
        // When failure is LWA (getAccessToken), no apiCallDetails; include details for debugging
        details: apiCallDetails ? undefined : (error as any).details
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
  /** When true, prefer HTML (confirmCustomizationDetails) over text-only. Overrides env. */
  forceHtml?: boolean;
}

type AllowedMessageType = 'confirmCustomizationDetails' | 'createConfirmOrderDetails' | null;

interface MessageTypeCheckResult {
  allowedType: AllowedMessageType;
  availableActions: string[];
  rawResponse: any;
  apiCallDetails?: any; // Full request/response details for Amazon support
}

/**
 * Check which messaging actions are available for this order
 * Returns the best available action type, or null if none are suitable
 */
async function checkAvailableMessageTypes(options: EnsureMessageTypeAllowedOptions): Promise<MessageTypeCheckResult> {
  try {
  const response = await callSellingPartnerApi({
    method: 'GET',
    path: `/messaging/v1/orders/${options.amazonOrderId}`,
    accessToken: options.accessToken,
      config: options.config,
      query: {
        marketplaceIds: options.config.marketplaceId // Amazon expects marketplaceIds query parameter (plural name, single value)
      }
    });

    // Amazon API returns actions in _links.actions array
    // Each action is an object with { name, href } structure
    const actionsArray = Array.isArray(response?._links?.actions)
      ? response._links.actions
    : [];

    const actions: string[] = actionsArray
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

    // Log available actions for debugging
    console.log('[Amazon Messaging] Available actions for order:', {
      orderId: options.amazonOrderId,
      actions,
      rawActions: actionsArray,
      responseStructure: {
        hasLinks: !!response?._links,
        hasActions: !!response?._links?.actions,
        actionsCount: actionsArray.length
      }
    });

    // Default to text-only (no HTML upload) to avoid Uploads API permission issues.
    // Set AMAZON_FORCE_TEXT_ONLY=false or pass forceHtml=true (test) to use HTML (confirmCustomizationDetails + Uploads API).
    // Note: Amazon API operation name is "createConfirmOrderDetails" but URL path is "confirmOrderDetails"
    const forceTextOnlyRaw = (process.env.AMAZON_FORCE_TEXT_ONLY ?? '').toString().trim().toLowerCase();
    const fromEnv = forceTextOnlyRaw !== 'false';
    const FORCE_TEXT_ONLY = options.forceHtml === true ? false : fromEnv;
    console.log('[Amazon Messaging] AMAZON_FORCE_TEXT_ONLY:', { raw: process.env.AMAZON_FORCE_TEXT_ONLY, normalized: forceTextOnlyRaw, forceHtmlOverride: options.forceHtml, forceTextOnly: FORCE_TEXT_ONLY });

    let allowedType: AllowedMessageType = null;
    if (FORCE_TEXT_ONLY && actions.includes('confirmOrderDetails')) {
      allowedType = 'createConfirmOrderDetails';
    } else if (FORCE_TEXT_ONLY && actions.includes('confirmCustomizationDetails')) {
      allowedType = 'createConfirmOrderDetails';
    } else if (actions.includes('confirmCustomizationDetails')) {
      allowedType = 'confirmCustomizationDetails';
    } else if (actions.includes('confirmOrderDetails')) {
      allowedType = 'createConfirmOrderDetails';
    }

    // Extract API call details if available from response
    const apiCallDetails = (response as any).__apiCallDetails;

    return {
      allowedType,
      availableActions: actions,
      rawResponse: response,
      apiCallDetails // Include for export
    };
  } catch (error: any) {
    // Re-throw AmazonMessagingError as-is, preserving apiCallDetails
    if (error instanceof AmazonMessagingError) {
      // apiCallDetails is already attached to the error in callSellingPartnerApi
      throw error;
    }
    // Wrap other errors
    const wrappedError = new AmazonMessagingError(
      error?.message || 'Failed to check message type availability',
      {
      retryable: false,
        details: { originalError: error?.message }
      }
    );
    // Preserve apiCallDetails if available
    if (error.apiCallDetails) {
      (wrappedError as any).apiCallDetails = error.apiCallDetails;
    }
    throw wrappedError;
  }
}

interface UploadHtmlDocumentOptions {
  amazonOrderId: string;
  html: string;
  accessToken: string;
  config: AmazonMessagingConfig;
  reminderType: ReminderType;
}

async function uploadHtmlDocument(options: UploadHtmlDocumentOptions) {
  const htmlBuffer = Buffer.from(options.html, 'utf8');
  
  // Calculate MD5 hash of the content (before encryption) for contentMD5 query parameter
  const contentMD5 = createHash('md5').update(htmlBuffer).digest('base64');

  // Full resource path per Uploads API model: resource = messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails
  // See https://github.com/amzn/selling-partner-api-models/blob/main/models/uploads-api-model/uploads_2020-11-01.json
  const resource = `messaging/v1/orders/${options.amazonOrderId}/messages/confirmCustomizationDetails`;
  const path = `/uploads/2020-11-01/uploadDestinations/${resource}`;

  const createResponse = await callSellingPartnerApi({
    method: 'POST',
    path,
    accessToken: options.accessToken,
    config: options.config,
    query: {
      marketplaceIds: [options.config.marketplaceId],
      contentMD5: contentMD5,
      contentType: 'text/html; charset=UTF-8'
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
  let bodyToUpload: Buffer;
  let md5Checksum: string;

  if (encryptionDetails) {
    bodyToUpload = encryptHtml(htmlBuffer, encryptionDetails);
    md5Checksum = createHash('md5').update(bodyToUpload).digest('base64');
  } else {
    // Messaging upload destination may return no encryption (plain upload); use raw content and MD5 of raw
    bodyToUpload = htmlBuffer;
    md5Checksum = contentMD5;
  }

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
    headers['Content-Type'] = encryptionDetails ? 'application/octet-stream' : 'text/html; charset=UTF-8';
  }
  headers['Content-MD5'] = md5Checksum;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: bodyToUpload
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
  /** Required by API: 1-800 chars. Shown with the attachment. */
  rawMessageBody: string;
}

async function sendConfirmCustomizationDetails(options: SendConfirmCustomizationDetailsOptions) {
  const rawMessageBody = options.rawMessageBody.slice(0, 800);
  if (!rawMessageBody.trim()) {
    throw new AmazonMessagingError('confirmCustomizationDetails requires non-empty rawMessageBody (1-800 chars)', { retryable: false });
  }

  const response = await callSellingPartnerApi({
    method: 'POST',
    path: `/messaging/v1/orders/${options.amazonOrderId}/messages/confirmCustomizationDetails`,
    accessToken: options.accessToken,
    config: options.config,
    query: {
      marketplaceIds: options.config.marketplaceId
    },
    body: {
      text: rawMessageBody,
      attachments: [
        {
          uploadDestinationId: options.documentId,
          fileName: buildAttachmentFileName(options.reminderType)
        }
      ]
    }
  });

  const messageId = response?.payload?.messageId || randomUUID();

  return {
    messageId
  };
}

interface SendConfirmOrderDetailsOptions {
  amazonOrderId: string;
  accessToken: string;
  config: AmazonMessagingConfig;
  previewUrl: string;
  childName?: string;
  reminderType: ReminderType;
}

/**
 * Send a confirmOrderDetails message (fallback when confirmCustomizationDetails isn't available)
 * Plain text with preview URL; newlines are preserved by Amazon Message Center for readability.
 */
async function sendConfirmOrderDetails(options: SendConfirmOrderDetailsOptions) {
  const child = options.childName || 'your child';
  const reminders: Record<ReminderType, string> = {
    initial: `Hi! Great news — ${child}'s personalized storybook is ready to see!\n\nClick the link below to view the preview and approve it for printing:\n\n${options.previewUrl}\n\nWe're so excited for you to see it. If we don't hear from you within 3 days, we'll go ahead and approve it so we can start printing.\n\nEvery child is the hero of their own story.\n— Little Hero Books`,
    'reminder-day-1': `Friendly reminder: ${child}'s story is waiting for your review!\n\nView the preview here:\n${options.previewUrl}\n\nPlease take a look in the next day or two.\n\nEvery child is the hero of their own story.\n— Little Hero Books`,
    'reminder-day-2': `Final reminder: we'll automatically approve ${child}'s book tomorrow unless you'd like to request a change.\n\nView the preview:\n${options.previewUrl}\n\nEvery child is the hero of their own story.\n— Little Hero Books`,
    'auto-approval': `Good news: we've approved ${child}'s book and production has started!\n\nYou can still view the preview here: ${options.previewUrl}\n\nEvery child is the hero of their own story.\n— Little Hero Books`
  };

  const messageText = reminders[options.reminderType] || reminders.initial;

  const response = await callSellingPartnerApi({
    method: 'POST',
    path: `/messaging/v1/orders/${options.amazonOrderId}/messages/confirmOrderDetails`,
    accessToken: options.accessToken,
    config: options.config,
    query: {
      marketplaceIds: options.config.marketplaceId
    },
    body: {
      text: messageText
    }
  });

  const messageId = response?.payload?.messageId || randomUUID();

  return {
    messageId
  };
}

export interface SendAmazonShippedMessageParams {
  amazonOrderId: string;
  trackingUrl?: string | null;
  trackingNumber?: string | null;
  childName?: string | null;
}

export interface SendAmazonShippedMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a "your book has been sent to print" message via Amazon Message Center (confirmOrderDetails).
 * Call from print-submitted webhook after W4 has submitted to Lulu. Includes preview link and note that the page will update with order status.
 */
export interface SendAmazonPrintSubmittedMessageParams {
  amazonOrderId: string;
  previewUrl: string;
  childName?: string;
}

export interface SendAmazonPrintSubmittedMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendAmazonPrintSubmittedMessage(
  params: SendAmazonPrintSubmittedMessageParams
): Promise<SendAmazonPrintSubmittedMessageResult> {
  const configResult = getAmazonMessagingConfig();
  if (!configResult.ok) {
    return { success: false, error: configResult.error };
  }
  const config = configResult.config;
  const accessToken = await getAccessToken(config);
  const child = params.childName || 'your child';

  const text =
    `Good news — ${child}'s book has been sent to the printer!\n\n` +
    `You can view your preview and check order status here:\n${params.previewUrl}\n\n` +
    `This page will update with your order status (e.g. when it ships).\n\n` +
    `Every child is the hero of their own story.\n— Little Hero Books`;

  try {
    const response = await callSellingPartnerApi({
      method: 'POST',
      path: `/messaging/v1/orders/${params.amazonOrderId}/messages/confirmOrderDetails`,
      accessToken,
      config,
      query: { marketplaceIds: config.marketplaceId },
      body: { text: text.slice(0, 2000) }
    });
    const messageId = (response as any)?.payload?.messageId ?? randomUUID();
    return { success: true, messageId };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return { success: false, error: message };
  }
}

/**
 * Send a "your book has shipped" message via Amazon Message Center (confirmOrderDetails).
 * Call from Lulu webhook when status becomes SHIPPED. Optional tracking URL or number.
 */
export async function sendAmazonShippedMessage(
  params: SendAmazonShippedMessageParams
): Promise<SendAmazonShippedMessageResult> {
  const configResult = getAmazonMessagingConfig();
  if (!configResult.ok) {
    return { success: false, error: configResult.error };
  }
  const config = configResult.config;
  const accessToken = await getAccessToken(config);
  const child = params.childName || 'your child';

  let trackingLine: string;
  if (params.trackingUrl?.trim()) {
    trackingLine = `Track your package here:\n\n${params.trackingUrl.trim()}`;
  } else if (params.trackingNumber?.trim()) {
    trackingLine = `Your tracking number: ${params.trackingNumber.trim()}`;
  } else {
    trackingLine = 'Your book is on its way!';
  }

  const text = `Good news — ${child}'s book has shipped!\n\n${trackingLine}\n\nEvery child is the hero of their own story.\n— Little Hero Books`;

  try {
    const response = await callSellingPartnerApi({
      method: 'POST',
      path: `/messaging/v1/orders/${params.amazonOrderId}/messages/confirmOrderDetails`,
      accessToken,
      config,
      query: { marketplaceIds: config.marketplaceId },
      body: { text: text.slice(0, 2000) }
    });
    const messageId = (response as any)?.payload?.messageId ?? randomUUID();
    return { success: true, messageId };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return { success: false, error: message };
  }
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
  query?: Record<string, string | number | string[] | undefined>;
}

async function callSellingPartnerApi(options: CallSpApiOptions) {
  const host = `sellingpartnerapi-${options.config.spRegion}.amazon.com`;
  const endpoint = `https://${host}${options.path}`;
  const url = new URL(endpoint);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          // For arrays, append each value (Amazon expects multiple marketplaceIds parameters)
          value.forEach(v => {
            if (v !== undefined && v !== null) {
              url.searchParams.append(key, String(v));
            }
          });
        } else {
        url.searchParams.append(key, String(value));
        }
      }
    }
  }

  const method = options.method.toUpperCase();
  const bodyString = options.body ? JSON.stringify(options.body) : '';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Headers that will be signed (for AWS SigV4)
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

  // Only sign the required headers (user-agent should NOT be signed)
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

  // Add user-agent header (required by Amazon but NOT signed)
  requestHeaders.set('user-agent', 'LittleHeroBooks/1.0 (Language=TypeScript/Node.js; Platform=Cloudflare)');

  if (process.env.AWS_SESSION_TOKEN) {
    requestHeaders.set('x-amz-security-token', process.env.AWS_SESSION_TOKEN);
  }

  // Capture full request details for Amazon support
  const requestTimestamp = amzDate;
  const fullRequestDetails = {
    method,
    url: url.toString(),
    path: options.path,
    headers: Object.fromEntries(requestHeaders.entries()),
    body: bodyString || null,
    timestamp: requestTimestamp,
    applicationId: options.config.lwaClientId,
    developerAccountId: options.config.sellerId,
    api: 'Selling Partner API',
    operation: options.path
  };

  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: bodyString || undefined
  });

  // Capture response metadata BEFORE reading body
  // In Cloudflare Workers, accessing response properties after reading body can cause issues
  const responseStatus = response.status;
  const responseStatusText = response.statusText;
  const responseOk = response.ok;
  
  // Capture response headers (including Request ID) BEFORE reading body
  // In Cloudflare Workers, we need to capture headers before body is consumed
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const requestId = responseHeaders['x-amzn-requestid'] || responseHeaders['x-amzn-RequestId'] || responseHeaders['x-amzn-RequestId'] || '';

  // Read response body ONCE as text, then parse manually
  // In Cloudflare Workers, response body can only be read once
  // Don't use .clone() - just read once and parse
  const text = await response.text().catch(() => '');
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  // Capture full response details for Amazon support
  const fullResponseDetails = {
    status: responseStatus,
    statusText: responseStatusText,
    headers: responseHeaders,
    body: text,
    requestId,
    timestamp: requestTimestamp
  };

  // Store request/response details for potential export (attach to error or return)
  const apiCallDetails = {
    request: fullRequestDetails,
    response: fullResponseDetails,
    applicationId: options.config.lwaClientId,
    developerAccountId: options.config.sellerId,
    api: 'Selling Partner API',
    operation: options.path,
    timestamp: requestTimestamp,
    requestId
  };

  // Log full request/response details in format Amazon requested (for support tickets)
  // This log entry contains ALL information Amazon needs
  const supportLogEntry = {
    // Amazon Support Request Fields
    applicationId: apiCallDetails.applicationId,
    developerAccountId: apiCallDetails.developerAccountId,
    api: apiCallDetails.api,
    operation: apiCallDetails.operation,
    timestamp: apiCallDetails.timestamp,
    requestId: apiCallDetails.requestId,
    // Full Request (headers + body)
    fullRequest: {
      method: fullRequestDetails.method,
      url: fullRequestDetails.url,
      path: fullRequestDetails.path,
      headers: fullRequestDetails.headers,
      body: fullRequestDetails.body
    },
    // Full Response (headers + body)
    fullResponse: {
      status: fullResponseDetails.status,
      statusText: fullResponseDetails.statusText,
      headers: fullResponseDetails.headers,
      body: fullResponseDetails.body // Full body for support
    }
  };
  
  console.log('[Amazon SP-API] Full Request/Response Details for Support:', JSON.stringify(supportLogEntry, null, 2));

  if (!responseOk) {
    // Log FULL error details for troubleshooting - this is critical for diagnosis
    const errorDetails = {
      status: responseStatus,
      statusText: responseStatusText,
      url: url.toString(),
      method: method,
      path: options.path,
      errorData: data,
      errors: data?.errors,
      firstError: data?.errors?.[0],
      rawResponse: text.substring(0, 1000), // First 1000 chars
      allErrorCodes: data?.errors?.map((e: any) => e.code) || [],
      allErrorMessages: data?.errors?.map((e: any) => e.message) || [],
      // Amazon support request details
      amazonSupportInfo: {
        applicationId: options.config.lwaClientId,
        developerAccountId: options.config.sellerId,
        api: 'Selling Partner API',
        operation: options.path,
        timestamp: requestTimestamp,
        requestId,
        fullRequest: fullRequestDetails,
        fullResponse: fullResponseDetails
      }
    };
    
    console.error('[Amazon SP-API] Request failed - FULL DETAILS:', JSON.stringify(errorDetails, null, 2));

    const errorMessage =
      data?.errors?.[0]?.message ||
      data?.message ||
      `Amazon SP-API request failed with status ${responseStatus}`;

    // Include ALL error details in the error message for frontend display
    const errorCode = data?.errors?.[0]?.code;
    const errorDetailsStr = data?.errors?.[0]?.details 
      ? ` Details: ${JSON.stringify(data.errors[0].details)}`
      : '';
    
    const detailedError = errorCode 
      ? `${errorMessage} (Code: ${errorCode}${errorDetailsStr})`
      : errorMessage;

    const error = new AmazonMessagingError(detailedError, {
      retryable: responseStatus >= 500,
      status: responseStatus,
      code: errorCode,
      details: data,
      url: url.toString(),
      path: options.path
    });
    
    // Attach API call details for Amazon support export
    (error as any).apiCallDetails = apiCallDetails;
    
    throw error;
  }

  // Attach API call details to successful response (for potential export)
  (data as any).__apiCallDetails = apiCallDetails;

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

  // Diagnostic logging to verify which credentials are actually being used
  const clientId = process.env.AMZ_APP_CLIENT_ID || '';
  const clientSecret = process.env.AMZ_APP_CLIENT_SECRET || '';
  const refreshToken = process.env.AMZ_REFRESH_TOKEN || '';

  console.log('[Amazon LWA Debug] Environment variables check:', {
    clientId: clientId.slice(0, 12) + (clientId.length > 12 ? '...' : ''),
    clientIdLength: clientId.length,
    clientSecret: clientSecret ? 'SET (' + clientSecret.length + ' chars)' : 'MISSING',
    refreshTokenPrefix: refreshToken.slice(0, 16) + (refreshToken.length > 16 ? '...' : ''),
    refreshTokenLength: refreshToken.length,
    configClientId: config.lwaClientId.substring(0, 12) + '...',
    configRefreshToken: config.lwaRefreshToken.substring(0, 16) + '...',
    match: {
      clientId: clientId === config.lwaClientId,
      refreshToken: refreshToken === config.lwaRefreshToken
    }
  });

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.lwaRefreshToken,
    client_id: config.lwaClientId,
    client_secret: config.lwaClientSecret
  });

  console.log('[LWA Token] Requesting access token:', {
    endpoint: ACCESS_TOKEN_ENDPOINT,
    clientId: config.lwaClientId.substring(0, 20) + '...',
    refreshTokenPreview: config.lwaRefreshToken.substring(0, 20) + '...',
    refreshTokenLength: config.lwaRefreshToken.length
  });

  const response = await fetch(ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  // Read response body once - can't read it twice in Cloudflare Workers
  const responseText = await response.text();
  let data: any;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok) {
    const errorMessage = data.error_description || data.error || responseText || 'Unknown error';
    console.error('[LWA Token] Failed to get access token:', {
      status: response.status,
      statusText: response.statusText,
      error: errorMessage,
      errorCode: data.error,
      fullResponse: data
    });
    
    throw new AmazonMessagingError(
      `Failed to obtain Amazon LWA access token: ${errorMessage}`,
      {
        retryable: response.status >= 500,
        status: response.status,
        details: data,
        errorCode: data.error
      }
    );
  }

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

