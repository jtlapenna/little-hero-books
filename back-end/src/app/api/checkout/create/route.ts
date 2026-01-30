/**
 * D2C Checkout: create order (pending payment) and return Stripe client secret.
 * Idempotent by Idempotency-Key header. See docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md Section 4.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase-client';
import { withIdempotency } from '@/lib/idempotency';
import { calculateCharacterHash } from '@/lib/character-hash';

export const dynamic = 'force-dynamic';

const ShippingAddressSchema = z.object({
  name: z.string().min(1),
  address_line1: z.string().min(1),
  address_line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().min(1),
});

const BodySchema = z.object({
  shipping_address: ShippingAddressSchema,
  customer_email: z.string().email(),
  customer_name: z.string().optional(),
  character_specs: z.object({
    childName: z.string().min(1),
    age: z.union([z.number().int().min(0).max(10), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v)),
  }).passthrough(),
  dedication: z.string().optional(),
  product_info: z.record(z.unknown()).optional(),
});

const DEFAULT_AMOUNT_CENTS = 2999; // $29.99

export async function POST(request: NextRequest) {
  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'Idempotency-Key header is required' },
      { status: 400 }
    );
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    const body = await request.json();
    parsed = BodySchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fields = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
      return NextResponse.json(
        { error: 'Validation failed', fields },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (parsed.shipping_address.country !== 'US') {
    return NextResponse.json(
      { error: 'Validation failed', fields: [{ path: 'shipping_address.country', message: 'Phase 0 supports US only' }] },
      { status: 400 }
    );
  }

  const response = await withIdempotency(
    idempotencyKey,
    async () => {
      const order_id = crypto.randomUUID();
      const character_specs = parsed.character_specs as Record<string, unknown>;
      const character_hash = calculateCharacterHash(character_specs, order_id);

      const now = new Date().toISOString();
      const orderPayload = {
        orderId: order_id,
        platform: 'd2c',
        amazon_order_id: null,
        customer_email: parsed.customer_email,
        customer_name: parsed.customer_name ?? parsed.shipping_address.name ?? null,
        shipping_address: parsed.shipping_address,
        character_specs: parsed.character_specs,
        character_hash,
        dedication_text: parsed.dedication ?? null,
        product_info: parsed.product_info ?? null,
        status: 'pending_payment',
        execution_status: 'pending_payment',
        next_workflow: null,
        created_at: now,
        updated_at: now,
      };

      const { error: insertError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single();

      if (insertError) {
        console.error('[Checkout] Order insert failed:', insertError.message);
        throw new Error('Failed to create order');
      }

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        console.error('[Checkout] STRIPE_SECRET_KEY not configured');
        throw new Error('Payment configuration error');
      }

      const amountCents = parseInt(process.env.D2C_CHECKOUT_AMOUNT_CENTS ?? '', 10) || DEFAULT_AMOUNT_CENTS;
      const stripe = new Stripe(stripeSecretKey);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        metadata: { order_id },
        automatic_payment_methods: { enabled: true },
      });

      if (!paymentIntent.client_secret) {
        throw new Error('Stripe did not return client_secret');
      }

      return {
        status: 201,
        body: {
          order_id,
          stripe_client_secret: paymentIntent.client_secret,
        },
      };
    },
    { ttlHours: 24 }
  );

  return NextResponse.json(response.body, { status: response.status });
}
