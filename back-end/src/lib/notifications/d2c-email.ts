/**
 * D2C email notifications (preview link, reminders, shipped).
 * Uses Resend. Logs to notification_logs when orderId is provided.
 */

import { Resend } from 'resend';
import { supabase } from '@/lib/supabase-client';

export type D2CReminderType =
  | 'initial'
  | 'reminder-day-1'
  | 'reminder-day-2'
  | 'auto-approval';

export interface SendD2CPreviewEmailParams {
  to: string;
  previewUrl: string;
  childName?: string;
  reminderType: D2CReminderType;
  orderId?: string;
}

export interface SendD2CShippedEmailParams {
  to: string;
  childName?: string;
  trackingUrl?: string;
  trackingNumber?: string;
  orderId?: string;
}

export interface D2CEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const DEFAULT_FROM = 'Little Hero Books <notifications@littleherolabs.com>';

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
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

function buildPreviewSubject(reminderType: D2CReminderType): string {
  switch (reminderType) {
    case 'initial':
      return "Your child's book preview is ready — Little Hero Books";
    case 'reminder-day-1':
      return "Reminder: Approve your child's book preview — Little Hero Books";
    case 'reminder-day-2':
      return "Last reminder: Approve your child's book — Little Hero Books";
    case 'auto-approval':
      return "We're approving your book and starting print — Little Hero Books";
    default:
      return "Your book preview is ready — Little Hero Books";
  }
}

function buildPreviewBody(params: {
  previewUrl: string;
  childName?: string;
  reminderType: D2CReminderType;
}): string {
  const child = params.childName ?? 'your child';
  const linkLine = `Review and approve here: ${params.previewUrl}`;
  const threeDayLine =
    "Please respond within 3 days or we'll approve automatically and begin printing.";
  const signOff = "Every child is the hero of their own story.\n— Little Hero Books";

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

/**
 * Send D2C preview email (initial or reminder). Optionally log to notification_logs when orderId is provided.
 */
export async function sendD2CPreviewEmail(
  params: SendD2CPreviewEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const subject = buildPreviewSubject(params.reminderType);
  const text = buildPreviewBody({
    previewUrl: params.previewUrl,
    childName: params.childName,
    reminderType: params.reminderType,
  });

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [params.to],
      subject,
      text,
    });

    if (error) {
      if (params.orderId) {
        await logNotification({
          orderId: params.orderId,
          recipient: params.to,
          status: 'failed',
          errorMessage: error.message,
        });
      }
      return { success: false, error: error.message };
    }

    const messageId = data?.id ?? undefined;
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

export interface SendD2CPrintSubmittedEmailParams {
  to: string;
  previewUrl: string;
  childName?: string;
  orderId?: string;
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

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const child = params.childName ?? 'your child';
  const subject = `${child}'s book has been sent to print! — Little Hero Books`;
  const text =
    `Good news — ${child}'s book has been sent to the printer!\n\n` +
    `You can view your preview and check order status here:\n${params.previewUrl}\n\n` +
    `This page will update with your order status (e.g. when it ships).\n\n` +
    `Every child is the hero of their own story.\n— Little Hero Books`;

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [params.to],
      subject,
      text,
    });

    if (error) {
      if (params.orderId) {
        await logNotification({
          orderId: params.orderId,
          recipient: params.to,
          status: 'failed',
          errorMessage: error.message,
        });
      }
      return { success: false, error: error.message };
    }

    const messageId = data?.id ?? undefined;
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
 * Send D2C shipped email with optional tracking. Optionally log to notification_logs when orderId is provided.
 */
export async function sendD2CShippedEmail(
  params: SendD2CShippedEmailParams
): Promise<D2CEmailResult> {
  if (!isD2CEmailEnabled()) {
    return { success: false, error: 'D2C email notifications are disabled' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'RESEND_API_KEY is not set' };
  }

  const child = params.childName ?? 'your child';
  let trackingLine: string;
  if (params.trackingUrl?.trim()) {
    trackingLine = `Track your package here:\n\n${params.trackingUrl.trim()}`;
  } else if (params.trackingNumber?.trim()) {
    trackingLine = `Your tracking number: ${params.trackingNumber.trim()}`;
  } else {
    trackingLine = 'Your book is on its way!';
  }

  const subject = `${child}'s book has shipped! — Little Hero Books`;
  const text = `Good news — ${child}'s book has shipped!\n\n${trackingLine}\n\nEvery child is the hero of their own story.\n— Little Hero Books`;

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [params.to],
      subject,
      text,
    });

    if (error) {
      if (params.orderId) {
        await logNotification({
          orderId: params.orderId,
          recipient: params.to,
          status: 'failed',
          errorMessage: error.message,
        });
      }
      return { success: false, error: error.message };
    }

    const messageId = data?.id ?? undefined;
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
