import { createCipheriv, createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { buildApprovalPageHtml } from '@/lib/approval-page-html';
import {
  type AmazonSpApiConfig,
  AmazonSpApiError,
  getAmazonSpApiConfig,
  getAccessToken,
  callSellingPartnerApi,
  resolveAmazonOrderId,
} from '@/lib/amazon-sp-api';

// Re-export for backward compatibility (callers import from this module)
export { resolveAmazonOrderId as getAmazonOrderIdForMessaging } from '@/lib/amazon-sp-api';
export { getAccessToken, callSellingPartnerApi } from '@/lib/amazon-sp-api';

type ReminderType = 'initial' | 'reminder-day-1' | 'reminder-day-2' | 'auto-approval';

// Messaging config extends base SP-API config with messaging-specific fields
export type AmazonMessagingConfig = AmazonSpApiConfig & {
  customerSiteUrl: string;
  autoApprovalHours: number;
};

export type AmazonMessagingConfigResult =
  | { ok: true; config: AmazonMessagingConfig }
  | { ok: false; error: string; issues: z.ZodIssue[] };

let cachedConfig: AmazonMessagingConfig | null = null;

export function getAmazonMessagingConfig(forceRefresh = false): AmazonMessagingConfigResult {
  if (!forceRefresh && cachedConfig) {
    return { ok: true, config: cachedConfig };
  }

  const baseResult = getAmazonSpApiConfig(forceRefresh);
  if (!baseResult.ok) return baseResult;

  const extraSchema = z.object({
    customerSiteUrl: z.string().url('CUSTOMER_SITE_URL must be a valid URL').default('https://littleherolabs.com'),
    autoApprovalHours: z.coerce.number().int().positive().default(72),
  });
  const extraResult = extraSchema.safeParse({
    customerSiteUrl: process.env.CUSTOMER_SITE_URL,
    autoApprovalHours: process.env.PREVIEW_AUTO_APPROVAL_HOURS,
  });
  if (!extraResult.success) {
    return { ok: false, error: 'Amazon Messaging env configuration is incomplete', issues: extraResult.error.issues };
  }

  cachedConfig = { ...baseResult.config, ...extraResult.data };
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
  apiCallDetails?: any;
}

// Use AmazonSpApiError under a local alias for existing catch blocks
const AmazonMessagingError = AmazonSpApiError;

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

