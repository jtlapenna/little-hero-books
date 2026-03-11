/**
 * D2C email notifications (preview link, reminders, shipped).
 * Uses Resend with branded HTML templates. Logs to notification_logs when orderId is provided.
 */

import { supabase } from '@/lib/supabase-client';
import { buildEmailHtml, buildStepsList, buildParagraph, buildEmphasis, buildSiblingItemRows } from './email-templates';

export type D2CReminderType =
  | 'initial'
  | 'reminder-day-1'
  | 'reminder-day-2'
  | 'auto-approval';

export interface SendD2COrderConfirmationEmailParams {
  to: string;
  childName?: string;
  displayOrderId: string;
  orderId?: string;
  previewImageUrl?: string;
}

export interface SendD2CSiblingOrderConfirmationEmailParams {
  to: string;
  items: Array<{ childName?: string; previewImageUrl?: string }>;
  displayOrderId: string;
  orderId?: string;
}

export interface SendD2CPreviewEmailParams {
  to: string;
  previewUrl: string;
  childName?: string;
  reminderType: D2CReminderType;
  orderId?: string;
  previewImageUrl?: string;
}

export interface SendD2CShippedEmailParams {
  to: string;
  childName?: string;
  trackingUrl?: string;
  trackingNumber?: string;
  carrier?: string;
  orderId?: string;
}

export interface D2CEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const DEFAULT_FROM = 'Little Hero Labs <notifications@littleherolabs.com>';

function getResendApiKey(): string | null {
  // Purpose: centralize env access + trimming.
  return process.env.RESEND_API_KEY?.trim() || null;
}

function getFromAddress(): string {
  return process.env.D2C_EMAIL_FROM?.trim() || DEFAULT_FROM;
}

function isD2CEmailEnabled(): boolean {
  const raw = process.env.D2C_EMAIL_ENABLED?.trim().toLowerCase();
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

async function logNotification(params: {
  orderId: string;
  recipient: string;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
  messageId?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from('notification_logs').insert({
    order_id: params.orderId,
    notification_type: 'email',
    status: params.status,
    recipient: params.recipient,
    error_message: params.status === 'sent' ? (params.messageId ? `messageId=${params.messageId}` : null) : params.errorMessage,
    sent_at: params.status === 'sent' ? now : null,
    created_at: now,
  });
}

async function sendViaResendHttp(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ id?: string; error?: string }> {
  // Purpose: avoid SDK runtime incompatibilities in Cloudflare Workers by using fetch directly.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });

  const text = await res.text();
  if (!res.ok) return { error: `Resend error (${res.status}): ${text.slice(0, 200)}` };
  try {
    const json = JSON.parse(text) as { id?: string };
    return { id: json.id };
  } catch {
    return { id: undefined };
  }
}

/**
 * Send D2C order confirmation email immediately after successful checkout.
 */
export async function sendD2COrderConfirmationEmail(
  params: SendD2COrderConfirmationEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    console.warn('[D2C Email] Order confirmation skipped: D2C_EMAIL_ENABLED is not true (in dev set D2C_EMAIL_ENABLED=true)');
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'failed',
        errorMessage: 'Skipped: D2C_EMAIL_ENABLED is not true',
      });
    }
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[D2C Email] Order confirmation skipped: RESEND_API_KEY is not set');
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'failed',
        errorMessage: 'Skipped: RESEND_API_KEY is not set',
      });
    }
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const child = params.childName ?? 'your child';
  const subject = `Order confirmed — ${child}'s adventure begins! — Little Hero Labs`;
  
  // Plain text fallback
  const text =
    `Thank you for your order!\n\n` +
    `We've received your order for ${child}'s personalized book.\n\n` +
    `Order ID: ${params.displayOrderId}\n\n` +
    `What happens next?\n` +
    `1. We'll create your personalized story and illustrations\n` +
    `2. You'll receive an email with a preview link to approve (within 24-48 hours)\n` +
    `3. Once approved, we'll print and ship your book!\n\n` +
    `Every child is the hero of their own story.\n— Little Hero Labs`;

  // Build HTML version
  const stepsHtml = buildStepsList([
    "We'll create your personalized story and illustrations",
    "You'll receive an email with a preview link to approve (within 24-48 hours)",
    "Once approved, we'll print and ship your book!",
  ]);
  
  const bodyHtml = 
    buildParagraph(`Thank you for your order! We've received your order for <strong>${child}'s</strong> personalized book.`) +
    buildParagraph('<strong>What happens next?</strong>') +
    stepsHtml;

  const infoBoxHtml = `
    <p style="margin: 0; font-size: 14px; color: #666;">Order ID</p>
    <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: #2D3142;">${params.displayOrderId}</p>
  `;

  const html = buildEmailHtml({
    heading: `${child}'s adventure begins!`,
    body: bodyHtml,
    previewImageUrl: params.previewImageUrl,
    infoBox: infoBoxHtml,
    childName: params.childName,
  });

  try {
    const from = getFromAddress();
    const { id, error } = await sendViaResendHttp({ apiKey, from, to: params.to, subject, text, html });
    if (error) {
      if (params.orderId) {
        await logNotification({
          orderId: params.orderId,
          recipient: params.to,
          status: 'failed',
          errorMessage: error,
        });
      }
      return { success: false, error };
    }

    const messageId = id ?? undefined;
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'sent',
        messageId: messageId ?? null,
      });
    }
    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'failed',
        errorMessage: message,
      });
    }
    return { success: false, error: message };
  }
}

/**
 * Send one D2C order confirmation email for a multi-item checkout.
 */
export async function sendD2CSiblingOrderConfirmationEmail(
  params: SendD2CSiblingOrderConfirmationEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    console.warn('[D2C Email] Sibling order confirmation skipped: D2C_EMAIL_ENABLED is not true');
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'failed',
        errorMessage: 'Skipped: D2C_EMAIL_ENABLED is not true',
      });
    }
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[D2C Email] Sibling order confirmation skipped: RESEND_API_KEY is not set');
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'failed',
        errorMessage: 'Skipped: RESEND_API_KEY is not set',
      });
    }
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const items = params.items.length ? params.items : [{ childName: 'Your little hero' }];
  const showImages = items.length > 0 && items.every((item) => Boolean(item.previewImageUrl?.trim()));
  const subject = 'Your Little Hero Labs order is confirmed!';
  const itemLines = items.map((item, index) => `${index + 1}. ${item.childName?.trim() || 'Your little hero'}`).join('\n');

  const text =
    `Thank you for your order!\n\n` +
    `We've received your multi-book Little Hero Labs order.\n\n` +
    `Books in your order:\n${itemLines}\n\n` +
    `Order ID: ${params.displayOrderId}\n\n` +
    `What happens next?\n` +
    `1. We'll create your personalized stories and illustrations\n` +
    `2. You'll receive preview approval emails for each book as they are ready\n` +
    `3. Once approved, we'll print and ship your books!\n\n` +
    `Every child is the hero of their own story.\n— Little Hero Labs`;

  const stepsHtml = buildStepsList([
    "We'll create your personalized stories and illustrations",
    "You'll receive preview approval emails for each book as they are ready",
    "Once approved, we'll print and ship your books!",
  ]);

  const bodyHtml =
    buildParagraph("Thank you for your order! We've received your multi-book <strong>Little Hero Labs</strong> order.") +
    buildParagraph('<strong>What happens next?</strong>') +
    stepsHtml;

  const infoBoxHtml = `
    <p style="margin: 0; font-size: 14px; color: #666;">Order ID</p>
    <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: #2D3142;">${params.displayOrderId}</p>
  `;

  const html = buildEmailHtml({
    heading: 'Your adventure books are on their way!',
    body: bodyHtml,
    supplementalContent: buildSiblingItemRows(
      showImages
        ? items
        : items.map((item) => ({ childName: item.childName }))
    ),
    infoBox: infoBoxHtml,
  });

  try {
    const from = getFromAddress();
    const { id, error } = await sendViaResendHttp({ apiKey, from, to: params.to, subject, text, html });
    if (error) {
      if (params.orderId) {
        await logNotification({
          orderId: params.orderId,
          recipient: params.to,
          status: 'failed',
          errorMessage: error,
        });
      }
      return { success: false, error };
    }

    const messageId = id ?? undefined;
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'sent',
        messageId: messageId ?? null,
      });
    }
    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (params.orderId) {
      await logNotification({
        orderId: params.orderId,
        recipient: params.to,
        status: 'failed',
        errorMessage: message,
      });
    }
    return { success: false, error: message };
  }
}

function buildPreviewSubject(reminderType: D2CReminderType): string {
  switch (reminderType) {
    case 'initial':
      return "Your child's book preview is ready — Little Hero Labs";
    case 'reminder-day-1':
      return "Reminder: Approve your child's book preview — Little Hero Labs";
    case 'reminder-day-2':
      return "Last reminder: Approve your child's book — Little Hero Labs";
    case 'auto-approval':
      return "We're approving your book and starting print — Little Hero Labs";
    default:
      return "Your book preview is ready — Little Hero Labs";
  }
}

function buildPreviewBodyText(params: {
  previewUrl: string;
  childName?: string;
  reminderType: D2CReminderType;
}): string {
  const child = params.childName ?? 'your child';
  const linkLine = `Review and approve here: ${params.previewUrl}`;
  const threeDayLine =
    "Please respond within 3 days or we'll approve automatically and begin printing.";
  const signOff = "Every child is the hero of their own story.\n— Little Hero Labs";

  switch (params.reminderType) {
    case 'initial':
      return `Your book preview is ready!\n\nClick the link below to review and approve ${child}'s personalized book:\n\n${linkLine}\n\n${threeDayLine}\n\n${signOff}`;
    case 'reminder-day-1':
      return `This is a friendly reminder — ${child}'s book preview is waiting for your approval.\n\n${linkLine}\n\n${threeDayLine}\n\n${signOff}`;
    case 'reminder-day-2':
      return `Last reminder — please approve ${child}'s book soon so we can start printing.\n\n${linkLine}\n\n${threeDayLine}\n\n${signOff}`;
    case 'auto-approval':
      return `We haven't heard back yet, so we're approving ${child}'s book and starting print. You can still view the preview: ${params.previewUrl}\n\n${signOff}`;
    default:
      return `Your book preview is ready. ${linkLine}\n\n${threeDayLine}\n\n${signOff}`;
  }
}

function buildPreviewBodyHtml(params: {
  previewUrl: string;
  childName?: string;
  reminderType: D2CReminderType;
}): { heading: string; body: string; showButton: boolean; urgencyText?: string } {
  const child = params.childName ?? 'your child';
  const threeDayNote = "Please respond within 3 days or we'll approve automatically and begin printing.";

  switch (params.reminderType) {
    case 'initial':
      return {
        heading: `${child}'s book preview is ready!`,
        body: buildParagraph(`Great news! Your personalized book for <strong>${child}</strong> is ready for review.`) +
              buildParagraph('Click the button below to see every page of the book and approve it for printing.'),
        showButton: true,
        urgencyText: threeDayNote,
      };
    case 'reminder-day-1':
      return {
        heading: `Reminder: ${child}'s preview awaits`,
        body: buildParagraph(`This is a friendly reminder — <strong>${child}'s</strong> book preview is waiting for your approval.`) +
              buildParagraph("Take a moment to review and approve so we can start creating your beautiful book!"),
        showButton: true,
        urgencyText: threeDayNote,
      };
    case 'reminder-day-2':
      return {
        heading: `Last reminder for ${child}'s book`,
        body: buildParagraph(`<strong>Last reminder</strong> — please approve <strong>${child}'s</strong> book soon so we can start printing.`) +
              buildParagraph("We want to make sure you're happy with your book before we print it!"),
        showButton: true,
        urgencyText: threeDayNote,
      };
    case 'auto-approval':
      return {
        heading: `${child}'s book is going to print!`,
        body: buildParagraph(`We haven't heard back yet, so we're approving <strong>${child}'s</strong> book and starting print.`) +
              buildParagraph("You can still view the preview using the button below."),
        showButton: true,
      };
    default:
      return {
        heading: `${child}'s book preview`,
        body: buildParagraph(`Your personalized book for <strong>${child}</strong> is ready for review.`),
        showButton: true,
        urgencyText: threeDayNote,
      };
  }
}

/**
 * Send D2C preview email (initial or reminder). Optionally log to notification_logs when orderId is provided.
 */
export async function sendD2CPreviewEmail(
  params: SendD2CPreviewEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const subject = buildPreviewSubject(params.reminderType);

  const text = buildPreviewBodyText({
    previewUrl: params.previewUrl,
    childName: params.childName,
    reminderType: params.reminderType,
  });

  const htmlContent = buildPreviewBodyHtml({
    previewUrl: params.previewUrl,
    childName: params.childName,
    reminderType: params.reminderType,
  });

  let bodyHtml = htmlContent.body;
  if (htmlContent.urgencyText) {
    bodyHtml += buildEmphasis(htmlContent.urgencyText);
  }

  const html = buildEmailHtml({
    heading: htmlContent.heading,
    body: bodyHtml,
    previewImageUrl: params.previewImageUrl,
    ctaButton: htmlContent.showButton ? {
      text: 'Review & Approve',
      url: params.previewUrl,
    } : undefined,
    childName: params.childName,
  });

  try {
    const from = getFromAddress();
    const { id, error } = await sendViaResendHttp({ apiKey, from, to: params.to, subject, text, html });
    if (error) {
      if (params.orderId) {
        await logNotification({ orderId: params.orderId, recipient: params.to, status: 'failed', errorMessage: error });
      }
      return { success: false, error };
    }

    const messageId = id ?? undefined;
    if (params.orderId) {
      await logNotification({ orderId: params.orderId, recipient: params.to, status: 'sent', messageId: messageId ?? null });
    }
    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (params.orderId) {
      await logNotification({ orderId: params.orderId, recipient: params.to, status: 'failed', errorMessage: message });
    }
    return { success: false, error: message };
  }
}

export interface SendD2CPrintSubmittedEmailParams {
  to: string;
  previewUrl: string;
  childName?: string;
  orderId?: string;
  previewImageUrl?: string;
}

/**
 * Send D2C "sent to print" email with preview link and note that the page will update with order status.
 */
export async function sendD2CPrintSubmittedEmail(
  params: SendD2CPrintSubmittedEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const child = params.childName ?? 'your child';
  const subject = `${child}'s book has been sent to print! — Little Hero Labs`;

  const text =
    `Good news — ${child}'s book has been sent to the printer!\n\n` +
    `You can view your preview and check order status here:\n${params.previewUrl}\n\n` +
    `This page will update with your order status (e.g. when it ships).\n\n` +
    `Every child is the hero of their own story.\n— Little Hero Labs`;

  const bodyHtml = 
    buildParagraph(`Good news — <strong>${child}'s</strong> book has been sent to the printer!`) +
    buildParagraph("Your personalized book is now being printed and will be on its way soon.") +
    buildParagraph("Click the button below to view your preview and check order status. This page will update when your book ships.");

  const html = buildEmailHtml({
    heading: `${child}'s book is printing!`,
    body: bodyHtml,
    previewImageUrl: params.previewImageUrl,
    ctaButton: {
      text: 'View Order Status',
      url: params.previewUrl,
    },
    childName: params.childName,
  });

  try {
    const from = getFromAddress();
    const { id, error } = await sendViaResendHttp({ apiKey, from, to: params.to, subject, text, html });
    if (error) {
      if (params.orderId) {
        await logNotification({ orderId: params.orderId, recipient: params.to, status: 'failed', errorMessage: error });
      }
      return { success: false, error };
    }

    const messageId = id ?? undefined;
    if (params.orderId) {
      await logNotification({ orderId: params.orderId, recipient: params.to, status: 'sent', messageId: messageId ?? null });
    }
    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (params.orderId) {
      await logNotification({ orderId: params.orderId, recipient: params.to, status: 'failed', errorMessage: message });
    }
    return { success: false, error: message };
  }
}

/**
 * Send D2C shipped email with optional tracking. Optionally log to notification_logs when orderId is provided.
 */
export async function sendD2CShippedEmail(
  params: SendD2CShippedEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const child = params.childName ?? 'your child';
  const carrierLabel = params.carrier?.trim() || 'OSM';

  // Build tracking info for plain-text and HTML
  let trackingLineText: string;
  let trackingInfoHtml: string | undefined;
  let ctaButton: { text: string; url: string } | undefined;

  if (params.trackingUrl?.trim()) {
    trackingLineText = `Carrier: ${carrierLabel}\nTrack your package here: ${params.trackingUrl.trim()}`;
    ctaButton = { text: 'Track Package', url: params.trackingUrl.trim() };
    trackingInfoHtml = `
      <p style="margin: 0; font-size: 14px; color: #666;">Carrier</p>
      <p style="margin: 4px 0 12px 0; font-size: 16px; font-weight: 600; color: #2D3142;">${carrierLabel}</p>
    `;
  } else if (params.trackingNumber?.trim()) {
    trackingLineText = `Carrier: ${carrierLabel}\nTracking number: ${params.trackingNumber.trim()}`;
    trackingInfoHtml = `
      <p style="margin: 0; font-size: 14px; color: #666;">Carrier</p>
      <p style="margin: 4px 0 12px 0; font-size: 16px; font-weight: 600; color: #2D3142;">${carrierLabel}</p>
      <p style="margin: 0; font-size: 14px; color: #666;">Tracking Number</p>
      <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 600; color: #2D3142; font-family: monospace;">${params.trackingNumber.trim()}</p>
    `;
  } else {
    trackingLineText = `Carrier: ${carrierLabel}\nYour book is on its way!`;
    trackingInfoHtml = `
      <p style="margin: 0; font-size: 14px; color: #666;">Carrier</p>
      <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 600; color: #2D3142;">${carrierLabel}</p>
    `;
  }

  const subject = `${child}'s book has shipped! — Little Hero Labs`;

  const text = `Good news — ${child}'s book has shipped!\n\n${trackingLineText}\n\nEvery child is the hero of their own story.\n— Little Hero Labs`;

  const bodyHtml = 
    buildParagraph(`Exciting news — <strong>${child}'s</strong> personalized book has shipped!`) +
    buildParagraph("Your book is on its way and should arrive soon. We hope it brings joy and adventure to your little hero!");

  const html = buildEmailHtml({
    heading: `${child}'s book is on its way!`,
    body: bodyHtml,
    ctaButton,
    infoBox: trackingInfoHtml,
    childName: params.childName,
  });

  try {
    const from = getFromAddress();
    const { id, error } = await sendViaResendHttp({ apiKey, from, to: params.to, subject, text, html });
    if (error) {
      if (params.orderId) {
        await logNotification({ orderId: params.orderId, recipient: params.to, status: 'failed', errorMessage: error });
      }
      return { success: false, error };
    }

    const messageId = id ?? undefined;
    if (params.orderId) {
      await logNotification({ orderId: params.orderId, recipient: params.to, status: 'sent', messageId: messageId ?? null });
    }
    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (params.orderId) {
      await logNotification({ orderId: params.orderId, recipient: params.to, status: 'failed', errorMessage: message });
    }
    return { success: false, error: message };
  }
}
