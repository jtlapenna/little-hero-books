/**
 * Stripe webhook: checkout.session.completed (or payment_intent.succeeded) → confirm D2C order and trigger n8n W0.
 * Idempotent by event.id. Raw body required for signature verification.
 * See docs/D2C-planning/implementation-planning/D2C-phase-0-orders-only.md Section 5.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase, getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';
import { withIdempotency } from '@/lib/idempotency';
import { buildD2CW0Payload } from '@/lib/w0-payload';
import { triggerW0 } from '@/lib/sibling-order-helpers';
import { sendD2COrderConfirmationEmail, sendD2CSiblingOrderConfirmationEmail } from '@/lib/notifications/d2c-email';
import { getObject, putObject, headObject, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildBaseCharacterAssetKey, buildCharacterAssetPrefix } from '@/lib/order-paths';

export const dynamic = 'force-dynamic';
const DEFAULT_W0_WEBHOOK_URL = 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-sibtest';

function getPublicAssetBaseUrl(): string {
  return (
    process.env.ADMIN_BASE_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    'https://admin.littleherolabs.com'
  ).replace(/\/+$/, '');
}

function resolveOrderBookId(orderData: Record<string, unknown>): string | undefined {
  const candidates = [orderData.book_id, orderData.project];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

async function buildPreviewImageUrl(
  characterHash?: string,
  bookId?: string,
): Promise<string | undefined> {
  const trimmedHash = characterHash?.trim();
  const trimmedBookId = bookId?.trim();
  if (!trimmedHash || !trimmedBookId) return undefined;

  const key = buildBaseCharacterAssetKey(trimmedHash, trimmedBookId);
  try {
    const response = await headObject(R2_PUBLIC_BUCKET, key);
    if (!response.ok) return undefined;
    return `${getPublicAssetBaseUrl()}/api/assets/${key}`;
  } catch (err) {
    console.warn('[Webhook Stripe] Preview image not available for email:', key, err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * Copy the D2C preview image to base-character.png at the character hash location.
 * This is the reference image for the character, NOT pose 0 (which is the cover image
 * generated separately by the workflow).
 */
async function copyPreviewToCharacterHash(
  previewHash: string,
  characterHash: string,
  bookId?: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmedBookId = bookId?.trim();
  if (!trimmedBookId) {
    return { success: false, error: 'bookId is required to copy preview assets' };
  }

  const sourceKey = `${buildCharacterAssetPrefix(previewHash, trimmedBookId)}/preview.png`;
  const destKey = buildBaseCharacterAssetKey(characterHash, trimmedBookId);
  
  try {
    // Check if preview exists
    const headResponse = await headObject(R2_PUBLIC_BUCKET, sourceKey);
    if (headResponse.status === 404) {
      console.warn('[Webhook Stripe] Preview not found at:', sourceKey);
      return { success: false, error: 'Preview image not found' };
    }
    
    // Check if destination already exists (don't overwrite)
    const destHeadResponse = await headObject(R2_PUBLIC_BUCKET, destKey);
    if (destHeadResponse.ok) {
      console.log('[Webhook Stripe] Base character already exists, skipping copy:', destKey);
      return { success: true };
    }
    
    // Get the preview image
    const getResponse = await getObject(R2_PUBLIC_BUCKET, sourceKey);
    const imageBlob = await getResponse.blob();
    
    // Put it at the character hash location
    await putObject(R2_PUBLIC_BUCKET, destKey, imageBlob, 'image/png');
    
    console.log('[Webhook Stripe] Copied preview to character hash:', { sourceKey, destKey });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Webhook Stripe] Failed to copy preview:', message);
    return { success: false, error: message };
  }
}

export async function POST(request: NextRequest) {
  // Purpose: make webhook receipt obvious in Cloudflare logs.
  console.log('[Webhook Stripe] Received request');
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? request.headers.get('Stripe-Signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header' }, { status: 401 });
  }

  // Purpose: prefer live secrets in production to avoid accidentally picking sandbox values.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook Stripe] STRIPE_SANDBOX_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SANDBOX_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('[Webhook Stripe] STRIPE_SANDBOX_SECRET_KEY or STRIPE_SECRET_KEY not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    // Purpose: Cloudflare Workers runtime compatibility (even though verification is local).
    const stripe = new Stripe(stripeSecretKey, { httpClient: Stripe.createFetchHttpClient() });
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Webhook Stripe] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 401 });
  }

  console.log('[Webhook Stripe] Verified event', { id: event.id, type: event.type, livemode: event.livemode });

  try {
  const response = await withIdempotency(
    event.id,
    async () => {
      let singleOrderId: string | undefined;
      let rootOrderId: string | undefined;

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        singleOrderId = session.metadata?.order_id as string | undefined;
        rootOrderId = session.metadata?.root_order_id as string | undefined;
        console.log('[Webhook Stripe] checkout.session.completed metadata:', { order_id: singleOrderId, root_order_id: rootOrderId, book_count: session.metadata?.book_count });
        if (!singleOrderId && !rootOrderId) {
          console.warn('[Webhook Stripe] checkout.session.completed missing metadata.order_id/root_order_id');
          return { status: 200, body: { received: true } };
        }
      } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        singleOrderId = paymentIntent.metadata?.order_id as string | undefined;
        rootOrderId = paymentIntent.metadata?.root_order_id as string | undefined;
        if (!singleOrderId && !rootOrderId) {
          console.warn('[Webhook Stripe] payment_intent.succeeded missing metadata.order_id/root_order_id');
          return { status: 200, body: { received: true } };
        }
      } else {
        return { status: 200, body: { received: true } };
      }

      // Resolve the list of order IDs to process
      let orderIds: string[];
      if (rootOrderId) {
        // Multi-book: find all sibling orders ({root}-item-{N})
        const pattern = `${rootOrderId}-item-%`;
        let siblingsRes = await supabase.from('orders').select('orderId').like('orderId', pattern);
        if ((siblingsRes.data?.length ?? 0) === 0) {
          // Fallback: try order_id column (schema may use snake_case)
          siblingsRes = await supabase.from('orders').select('order_id').like('order_id', pattern);
        }
        const siblings = siblingsRes.data ?? [];
        orderIds = siblings
          .map((s: { orderId?: string; order_id?: string }) => s.orderId ?? s.order_id ?? '')
          .filter(Boolean);
        const parseItemIndex = (id: string): number | null => {
          const m = id.match(/-item-(\d+)$/);
          return m ? parseInt(m[1], 10) : null;
        };
        orderIds.sort((a, b) => {
          const ai = parseItemIndex(a);
          const bi = parseItemIndex(b);
          if (ai != null && bi != null) return ai - bi;
          if (ai != null) return -1;
          if (bi != null) return 1;
          return a.localeCompare(b);
        });
        if (orderIds.length === 0) {
          console.warn('[Webhook Stripe] No sibling orders found for root_order_id:', rootOrderId, 'pattern:', pattern, 'siblingsResError:', siblingsRes.error?.message);
          return { status: 200, body: { received: true } };
        }
        console.log('[Webhook Stripe] Multi-book: found', orderIds.length, 'orders for root', rootOrderId, 'orderIds:', orderIds);
      } else {
        orderIds = [singleOrderId!];
      }

      const ordersToProcess: Array<{
        orderId: string;
        orderData: Record<string, unknown>;
        wasPendingPayment: boolean;
      }> = [];

      // Normalize the whole sibling set first so a W0 outage doesn't leave mixed sibling states.
      for (const order_id of orderIds) {
        const order = await getOrderFromSupabase(order_id).catch(() => null);
        if (!order) {
          console.warn('[Webhook Stripe] Order not found:', order_id);
          continue;
        }

        const orderData = order as Record<string, unknown>;
        const executionStatus = orderData.execution_status as string | undefined;
        const nextWorkflow = orderData.next_workflow as string | null | undefined;
        const isPendingPayment = executionStatus === 'pending_payment';
        const isStuckPendingW0 = executionStatus === 'pending_w0' && (nextWorkflow == null || nextWorkflow === '');
        if (!isPendingPayment && !isStuckPendingW0) {
          console.log('[Webhook Stripe] Order already processed (execution_status=%s, next_workflow=%s), skipping', executionStatus ?? 'undefined', nextWorkflow ?? 'null');
          continue;
        }

        if (isPendingPayment) {
          const now = new Date().toISOString();
          await updateOrderInSupabase(order_id, {
            execution_status: 'pending_w0',
            next_workflow: null,
            status: 'pending_w0',
            purchase_date: now,
            updated_at: now,
          });
          orderData.execution_status = 'pending_w0';
          orderData.next_workflow = null;
          orderData.status = 'pending_w0';
          orderData.purchase_date = now;
          orderData.updated_at = now;
        }

        ordersToProcess.push({
          orderId: order_id,
          orderData,
          wasPendingPayment: isPendingPayment,
        });
      }

      // Copy previews first so confirmation emails can use the copied base-character key when present.
      for (const { orderData } of ordersToProcess) {
        const platform = orderData.platform as string | undefined;
        const previewHash = orderData.preview_hash as string | undefined;
        const characterHash = orderData.character_hash as string | undefined;
        const bookId = resolveOrderBookId(orderData);

        if (platform === 'd2c' && previewHash && characterHash) {
          const copyResult = await copyPreviewToCharacterHash(previewHash, characterHash, bookId);
          if (!copyResult.success) {
            console.warn('[Webhook Stripe] Preview copy failed (non-fatal):', copyResult.error);
          }
        }
      }

      // Send one confirmation email per checkout, not per row.
      const emailEligibleOrders = ordersToProcess.filter(({ orderData, wasPendingPayment }) =>
        wasPendingPayment &&
        (orderData.platform as string | undefined) === 'd2c' &&
        Boolean((orderData.customer_email as string | undefined)?.trim())
      );

      if (emailEligibleOrders.length > 0) {
        const firstEmailOrder = emailEligibleOrders[0];
        const orderData = firstEmailOrder.orderData;
        const customerEmail = (orderData.customer_email as string).trim();
        const displayOrderId =
          (orderData.display_order_id as string) ||
          `LH-${String(firstEmailOrder.orderId).substring(0, 5).toUpperCase()}`;

        if (emailEligibleOrders.length > 1) {
          const items = await Promise.all(emailEligibleOrders.map(async ({ orderData: itemOrderData }) => {
            const characterSpecs = itemOrderData.character_specs as Record<string, unknown> | undefined;
            const childName = (characterSpecs?.childName ?? characterSpecs?.name) as string | undefined;
            const previewImageUrl = await buildPreviewImageUrl(
              itemOrderData.character_hash as string | undefined,
              resolveOrderBookId(itemOrderData),
            );
            return { childName, previewImageUrl };
          }));

          const emailResult = await sendD2CSiblingOrderConfirmationEmail({
            to: customerEmail,
            items,
            displayOrderId,
            orderId: firstEmailOrder.orderId,
          });
          if (!emailResult.success) {
            console.warn('[Webhook Stripe] Sibling order confirmation email failed:', emailResult.error);
          } else {
            console.log('[Webhook Stripe] Sibling order confirmation email sent to:', customerEmail);
          }
        } else {
          const characterSpecs = orderData.character_specs as Record<string, unknown> | undefined;
          const childName = (characterSpecs?.childName ?? characterSpecs?.name) as string | undefined;
          const previewImageUrl = await buildPreviewImageUrl(
            orderData.character_hash as string | undefined,
            resolveOrderBookId(orderData),
          );

          const emailResult = await sendD2COrderConfirmationEmail({
            to: customerEmail,
            childName,
            displayOrderId,
            orderId: firstEmailOrder.orderId,
            previewImageUrl,
          });
          if (!emailResult.success) {
            console.warn('[Webhook Stripe] Order confirmation email failed:', emailResult.error);
          } else {
            console.log('[Webhook Stripe] Order confirmation email sent to:', customerEmail);
          }
        }

      }

      for (const { orderId: order_id, orderData } of ordersToProcess) {
        // Trigger W0 for this book — throw on failure so Stripe retries and failure is visible
        const w0Url = process.env.N8N_W0_WEBHOOK_URL || DEFAULT_W0_WEBHOOK_URL;
        if (!w0Url) {
          throw new Error('N8N_W0_WEBHOOK_URL not configured — cannot trigger W0. Set env var and ensure n8n webhook is active.');
        }
        const payload = buildD2CW0Payload(orderData);
        const w0Result = await triggerW0(payload);
        if (!w0Result.ok) {
          throw new Error(`W0 trigger failed for ${order_id}: ${w0Result.error}. Check N8N_W0_WEBHOOK_URL points to an active n8n webhook.`);
        }
        console.log('[Webhook Stripe] W0 triggered successfully for', order_id);
      }

      return { status: 200, body: { received: true } };
    },
    { ttlHours: 24 }
  );

  return NextResponse.json(response.body, { status: response.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Webhook Stripe] Handler error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
