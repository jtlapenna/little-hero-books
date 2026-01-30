/**
 * Stripe webhook: payment_intent.succeeded → confirm D2C order and trigger n8n W0.
 * Idempotent by event.id. Raw body required for signature verification.
 * See docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md Section 5.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';
import { withIdempotency } from '@/lib/idempotency';
import { buildD2CW0Payload } from '@/lib/w0-payload';

export const dynamic = 'force-dynamic';

const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? request.headers.get('Stripe-Signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header' }, { status: 401 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook Stripe] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('[Webhook Stripe] STRIPE_SECRET_KEY not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeSecretKey);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Webhook Stripe] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 401 });
  }

  const response = await withIdempotency(
    event.id,
    async () => {
      if (event.type !== 'payment_intent.succeeded') {
        return { status: 200, body: { received: true } };
      }

      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const order_id = paymentIntent.metadata?.order_id as string | undefined;

      if (!order_id) {
        console.warn('[Webhook Stripe] payment_intent.succeeded missing metadata.order_id');
        return { status: 200, body: { received: true } };
      }

      const order = await getOrderFromSupabase(order_id).catch(() => null);
      if (!order) {
        console.warn('[Webhook Stripe] Order not found:', order_id);
        return { status: 200, body: { received: true } };
      }

      const executionStatus = (order as Record<string, unknown>).execution_status as string | undefined;
      if (executionStatus !== 'pending_payment') {
        return { status: 200, body: { received: true } };
      }

      const now = new Date().toISOString();
      await updateOrderInSupabase(order_id, {
        execution_status: 'pending_w0',
        next_workflow: null,
        status: 'pending_w0',
        purchase_date: now,
        updated_at: now,
      });

      if (!n8nW0WebhookUrl) {
        console.error('[Webhook Stripe] N8N_W0_WEBHOOK_URL not configured');
        return { status: 200, body: { received: true } };
      }

      const payload = buildD2CW0Payload(order as Record<string, unknown>);
      const w0Response = await fetch(n8nW0WebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!w0Response.ok) {
        const text = await w0Response.text();
        console.error('[Webhook Stripe] W0 webhook failed:', w0Response.status, text.substring(0, 200));
      }

      return { status: 200, body: { received: true } };
    },
    { ttlHours: 24 }
  );

  return NextResponse.json(response.body, { status: response.status });
}
