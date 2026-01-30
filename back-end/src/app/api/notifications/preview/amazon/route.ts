import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { sendAmazonPreviewMessage } from '@/lib/notifications/amazon-message-center';
import { sendD2CPreviewEmail } from '@/lib/notifications/d2c-email';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
} as const;

const requestSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  token: z.string().min(1, 'token is required'),
  reminderType: z
    .enum(['initial', 'reminder-day-1', 'reminder-day-2', 'auto-approval'])
    .default('initial')
});

type RequestPayload = z.infer<typeof requestSchema>;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders
  });
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parseResult = requestSchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request payload',
          issues: parseResult.error.issues
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const payload: RequestPayload = parseResult.data;

    const order = await getOrderFromSupabase(payload.orderId);

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: `Order ${payload.orderId} not found`
        },
        { status: 404, headers: corsHeaders }
      );
    }

    const platform = (order.platform ?? 'amazon') as string;
    const customerSiteUrl =
      (() => {
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
        return process.env.CUSTOMER_SITE_URL?.replace(/\/+$/, '') ||
          (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');
      })();

    const childName =
      (order.character_specs && order.character_specs.childName) ||
      (order.character_specs && order.character_specs.child_name) ||
      undefined;

    const previewUrl = `${customerSiteUrl}/approve/${payload.token}`;

    // D2C: send preview by email (sendD2CPreviewEmail logs to notification_logs when orderId is provided)
    if (platform === 'd2c') {
      if (!order.customer_email?.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: 'D2C order is missing customer_email'
          },
          { status: 400, headers: corsHeaders }
        );
      }
      const d2cResponse = await sendD2CPreviewEmail({
        to: order.customer_email.trim(),
        previewUrl,
        childName,
        reminderType: payload.reminderType,
        orderId: payload.orderId,
      });
      if (!d2cResponse.success) {
        return NextResponse.json(
          {
            success: false,
            error: d2cResponse.error || 'Failed to send D2C preview email'
          },
          { status: 502, headers: corsHeaders }
        );
      }
      return NextResponse.json(
        {
          success: true,
          messageId: d2cResponse.messageId,
          documentId: undefined,
          previewUrl,
          reminderType: payload.reminderType
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Amazon: send via Message Center
    const amazonOrderId = order.amazon_order_id ?? null;
    if (!amazonOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Order is missing amazon_order_id'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const response = await sendAmazonPreviewMessage({
      amazonOrderId,
      reminderType: payload.reminderType,
      previewUrl,
      childName,
      revisionsRemaining: Math.max(0, 2 - (order.revision_count || 0))
    });

    await logNotificationAttempt({
      orderIdentifier: amazonOrderId,
      status: response.success ? 'sent' : 'failed',
      recipient: `amazon:${amazonOrderId}`,
      errorMessage: response.error,
      messageId: response.messageId,
      documentId: response.documentId
    });

    if (!response.success) {
      return NextResponse.json(
        {
          success: false,
          error: response.error || 'Failed to send Amazon Message Center notification',
          issues: response.issues
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        messageId: response.messageId,
        documentId: response.documentId,
        previewUrl,
        reminderType: payload.reminderType
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: unknown) {
    console.error('[API] Amazon preview notification error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected server error'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

interface LogParams {
  orderIdentifier: string;
  status: 'sent' | 'failed';
  recipient: string;
  errorMessage?: string;
  messageId?: string;
  documentId?: string;
}

async function logNotificationAttempt(params: LogParams) {
  const now = new Date().toISOString();

  const { error } = await supabase.from('notification_logs').insert({
    order_id: params.orderIdentifier,
    notification_type: 'amazon_message',
    status: params.status,
    recipient: params.recipient,
    error_message: params.errorMessage || buildSuccessNote(params),
    sent_at: params.status === 'sent' ? now : null,
    created_at: now
  });

  if (error) {
    console.error('[Notification Logs] Failed to insert Amazon message log', error);
  }
}

function buildSuccessNote(params: LogParams) {
  if (params.status !== 'sent') {
    return params.errorMessage || null;
  }

  const parts = [];
  if (params.messageId) {
    parts.push(`messageId=${params.messageId}`);
  }
  if (params.documentId) {
    parts.push(`documentId=${params.documentId}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

