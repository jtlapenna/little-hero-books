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
import { sendD2COrderConfirmationEmail } from '@/lib/notifications/d2c-email';
import { getObject, putObject, headObject, R2_PUBLIC_BUCKET, R2_CHARACTERS_PREFIX } from '@/lib/r2-client';
import { getSignedUrlForObject } from '@/lib/r2-service';

export const dynamic = 'force-dynamic';

/**
 * Copy the D2C preview image to base-character.png at the character hash location.
 * This is the reference image for the character, NOT pose 0 (which is the cover image
 * generated separately by the workflow).
 */
async function copyPreviewToCharacterHash(previewHash: string, characterHash: string): Promise<{ success: boolean; error?: string }> {
  const sourceKey = `${R2_CHARACTERS_PREFIX}${previewHash}/preview.png`;
  const destKey = `${R2_CHARACTERS_PREFIX}${characterHash}/base-character.png`;
  
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

const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL;

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

  console.log('[Webhook Stripe] Verified event', { id: event.id, type: event.type, livemode: (event as any).livemode });

  const response = await withIdempotency(
    event.id,
    async () => {
      let singleOrderId: string | undefined;
      let rootOrderId: string | undefined;

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        singleOrderId = session.metadata?.order_id as string | undefined;
        rootOrderId = session.metadata?.root_order_id as string | undefined;
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
        const { data: siblings } = await supabase
          .from('orders')
          .select('orderId')
          .like('orderId', `${rootOrderId}-item-%`);
        orderIds = (siblings ?? []).map((s: { orderId: string }) => s.orderId);
        // Purpose: deterministic primary selection for the confirmation email.
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
          console.warn('[Webhook Stripe] No sibling orders found for root_order_id:', rootOrderId);
          return { status: 200, body: { received: true } };
        }
        console.log(`[Webhook Stripe] Multi-book: found ${orderIds.length} orders for root ${rootOrderId}`);
      } else {
        orderIds = [singleOrderId!];
      }

      // Email sent once (using first order for data)
      let emailSent = false;

      for (const order_id of orderIds) {
        const order = await getOrderFromSupabase(order_id).catch(() => null);
        if (!order) {
          console.warn('[Webhook Stripe] Order not found:', order_id);
          continue;
        }

        const orderData = order as Record<string, unknown>;
        const executionStatus = orderData.execution_status as string | undefined;
        console.log('[Webhook Stripe] Order status gate', { order_id, executionStatus: executionStatus ?? 'undefined' });
        if (executionStatus !== 'pending_payment') {
          console.log('[Webhook Stripe] Order already processed (execution_status=%s), skipping', executionStatus ?? 'undefined');
          continue;
        }

        const now = new Date().toISOString();
        await updateOrderInSupabase(order_id, {
          execution_status: 'pending_w0',
          next_workflow: null,
          status: 'pending_w0',
          purchase_date: now,
          updated_at: now,
        });

        const platform = orderData.platform as string | undefined;
        const customerEmail = orderData.customer_email as string | undefined;
        const characterSpecs = orderData.character_specs as Record<string, unknown> | undefined;
        const childName = (characterSpecs?.childName ?? characterSpecs?.name) as string | undefined;
        const previewHash = orderData.preview_hash as string | undefined;
        const characterHash = orderData.character_hash as string | undefined;
        const displayOrderId = (orderData.display_order_id as string) || `LH-${order_id.substring(0, 5).toUpperCase()}`;

        // Copy preview image to character hash location
        if (platform === 'd2c' && previewHash && characterHash) {
          const copyResult = await copyPreviewToCharacterHash(previewHash, characterHash);
          if (!copyResult.success) {
            console.warn('[Webhook Stripe] Preview copy failed (non-fatal):', copyResult.error);
          }
        }

        // Send one confirmation email for the whole checkout
        if (!emailSent && platform === 'd2c' && customerEmail?.trim()) {
          let previewImageUrl: string | undefined;
          if (previewHash) {
            try {
              const previewKey = `${R2_CHARACTERS_PREFIX}${previewHash}/preview.png`;
              previewImageUrl = await getSignedUrlForObject(previewKey, R2_PUBLIC_BUCKET, 604800);
            } catch (err) {
              console.warn('[Webhook Stripe] Failed to generate preview image URL:', err);
            }
          }

          const emailResult = await sendD2COrderConfirmationEmail({
            to: customerEmail.trim(),
            childName,
            displayOrderId,
            orderId: order_id,
            previewImageUrl,
          });
          if (!emailResult.success) {
            console.warn('[Webhook Stripe] Order confirmation email failed:', emailResult.error);
          } else {
            console.log('[Webhook Stripe] Order confirmation email sent to:', customerEmail);
          }
          emailSent = true;
        }

        // Trigger W0 for this book
        const payload = buildD2CW0Payload(orderData);
        const w0Result = await triggerW0(payload);
        if (!w0Result.ok) {
          console.error(`[Webhook Stripe] W0 trigger failed for ${order_id}:`, w0Result.error);
        } else {
          console.log(`[Webhook Stripe] W0 triggered for ${order_id}`);
        }
      }

      return { status: 200, body: { received: true } };
    },
    { ttlHours: 24 }
  );

  return NextResponse.json(response.body, { status: response.status });
}
