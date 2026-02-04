/**
 * D2C Checkout: create order (pending payment) and return Stripe Checkout Session URL.
 * Idempotent by Idempotency-Key header. See docs/D2C-planning/implementation-planning/D2C-phase-0-orders-only.md Section 4.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase-client';
import { withIdempotency } from '@/lib/idempotency';
import { calculateCharacterHash, calculatePreviewHash } from '@/lib/character-hash';

export const dynamic = 'force-dynamic';

/**
 * Infer clothing style from pronouns (matches Amazon order logic).
 * Default: t-shirt and shorts for neutral/masculine pronouns, dress for feminine.
 */
function inferClothingFromPronouns(pronouns: unknown): string {
  if (pronouns === 'she-her') return 'dress';
  return 't-shirt and shorts';
}

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = process.env.D2C_FRONTEND_ORIGIN ?? '';
  const requestOrigin = request.headers.get('origin') ?? '';
  const allowOrigin = origin && (requestOrigin === origin || requestOrigin.endsWith('.littleherolabs.com')) ? requestOrigin : origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

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
    // Accept either childName or name (frontend uses 'name', normalize to 'childName')
    childName: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    age: z.union([z.number().int().min(0).max(10), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v)),
  }).passthrough().refine(
    (data) => data.childName || data.name,
    { message: 'Either childName or name is required' }
  ),
  dedication: z.string().optional(),
  product_info: z.record(z.unknown()).optional(),
});

const DEFAULT_AMOUNT_CENTS = 2999; // $29.99

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'Idempotency-Key header is required' },
      { status: 400, headers: corsHeaders }
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
        { status: 400, headers: corsHeaders }
      );
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  if (parsed.shipping_address.country !== 'US') {
    return NextResponse.json(
      { error: 'Validation failed', fields: [{ path: 'shipping_address.country', message: 'Phase 0 supports US only' }] },
      { status: 400, headers: corsHeaders }
    );
  }

  const frontendOrigin = process.env.D2C_FRONTEND_ORIGIN ?? '';
  if (!frontendOrigin) {
    console.error('[Checkout] D2C_FRONTEND_ORIGIN not configured');
    return NextResponse.json(
      { error: 'Checkout configuration error' },
      { status: 500, headers: corsHeaders }
    );
  }

  const response = await withIdempotency(
    idempotencyKey,
    async () => {
      const order_id = crypto.randomUUID();
      // Generate customer-friendly display ID: LH-XXXXX (first 5 chars of UUID, uppercase)
      const display_order_id = `LH-${order_id.substring(0, 5).toUpperCase()}`;
      
      // Normalize character_specs to match Amazon order format:
      // - childName (frontend may send 'name')
      // - animalGuide (frontend sends 'favoriteAnimal')
      // - clothingStyle (inferred from pronouns if not provided)
      const rawSpecs = parsed.character_specs as Record<string, unknown>;
      const character_specs = {
        ...rawSpecs,
        childName: rawSpecs.childName ?? rawSpecs.name,
        animalGuide: rawSpecs.animalGuide ?? rawSpecs.favoriteAnimal,
        clothingStyle: rawSpecs.clothingStyle ?? inferClothingFromPronouns(rawSpecs.pronouns),
      };
      
      const character_hash = calculateCharacterHash(character_specs, order_id);
      // Preview hash uses only visual traits (for caching) - different from character_hash
      const preview_hash = calculatePreviewHash(character_specs);

      const now = new Date().toISOString();
      
      // Build book_specs with defaults for D2C orders (admin panel reads from this)
      const childName = character_specs.childName as string;
      const book_specs = {
        title: `${childName} and the Adventure Compass`,
        totalPages: 16,
        format: '8.5x8.5_softcover',
        bookType: 'adventure',
      };
      
      // Also store in product_info for compatibility with other systems
      const product_info = {
        ...book_specs,
        ...parsed.product_info, // Allow override from request if provided
      };
      
      const orderPayload = {
        orderId: order_id,
        display_order_id,
        platform: 'd2c',
        amazon_order_id: null,
        customer_email: parsed.customer_email,
        customer_name: parsed.customer_name ?? parsed.shipping_address.name ?? null,
        shipping_address: parsed.shipping_address,
        character_specs,
        character_hash,
        preview_hash, // Store preview hash for copying preview to pose 0 after payment
        dedication_text: parsed.dedication ?? null,
        book_specs, // For admin panel display (format, pages, title)
        product_info, // For workflow compatibility
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

      // Use sandbox key if available, otherwise fall back to live key
      const stripeSecretKey = process.env.STRIPE_SANDBOX_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        console.error('[Checkout] STRIPE_SANDBOX_SECRET_KEY or STRIPE_SECRET_KEY not configured');
        throw new Error('Payment configuration error');
      }

      const amountCents = parseInt(process.env.D2C_CHECKOUT_AMOUNT_CENTS ?? '', 10) || DEFAULT_AMOUNT_CENTS;
      const stripe = new Stripe(stripeSecretKey);

      const successUrl = `${frontendOrigin}/create/processing?order_id=${encodeURIComponent(order_id)}`;
      const cancelUrl = `${frontendOrigin}/create/checkout`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: 'Little Hero Book — Personalized Children\'s Book',
                description: 'Custom storybook starring your child as the hero.',
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { order_id },
        customer_email: parsed.customer_email,
      });

      if (!session.url) {
        throw new Error('Stripe did not return checkout session URL');
      }

      return {
        status: 201,
        body: {
          order_id,
          display_order_id,
          stripe_checkout_session_url: session.url,
        },
      };
    },
    { ttlHours: 24 }
  );

  return NextResponse.json(response.body, { status: response.status, headers: corsHeaders });
}
