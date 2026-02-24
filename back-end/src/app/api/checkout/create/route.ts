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
import { buildSiblingOrderId } from '@/lib/sibling-order-helpers';

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
  // Purpose: allow the D2C frontend to call this API cross-origin.
  const configuredOrigin = (process.env.D2C_FRONTEND_ORIGIN ?? '').trim();
  const requestOrigin = (request.headers.get('origin') ?? '').trim();
  const isAllowedRequestOrigin =
    requestOrigin === 'https://littleherolabs.com' ||
    requestOrigin.endsWith('.littleherolabs.com') ||
    /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin);

  // Purpose: prefer explicit allowlist, otherwise fall back to safe request origin.
  const allowOrigin = configuredOrigin || (isAllowedRequestOrigin ? requestOrigin : '*');
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
  phone_number: z.string().min(7).optional(),
  address_line1: z.string().min(1),
  address_line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().min(1),
});

const SHIPPING_TIER_ENUM = z.enum(['mail', 'ground_home', 'priority_mail', 'expedited', 'express']);
export type ShippingTier = z.infer<typeof SHIPPING_TIER_ENUM>;

/** Rounded customer-facing shipping prices (cents). Labels for Stripe line item. */
const SHIPPING_CENTS_BY_TIER: Record<ShippingTier, number> = {
  mail: 599,
  ground_home: 1299,
  priority_mail: 1499,
  expedited: 2099,
  express: 3099,
};

const SHIPPING_LABEL_BY_TIER: Record<ShippingTier, string> = {
  mail: 'Economy',
  ground_home: 'Ground',
  priority_mail: 'Priority Mail',
  expedited: 'Expedited Shipping',
  express: 'Express Shipping',
};

const CharacterSpecsSchema = z.object({
  childName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  age: z.union([z.number().int().min(0).max(10), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v)),
}).passthrough().refine(
  (data) => data.childName || data.name,
  { message: 'Either childName or name is required' }
);

const BookItemSchema = z.object({
  character_specs: CharacterSpecsSchema,
  dedication: z.string().optional(),
});

const BodySchema = z.object({
  shipping_address: ShippingAddressSchema,
  customer_email: z.string().email(),
  customer_name: z.string().optional(),
  // Single book (backward compat)
  character_specs: CharacterSpecsSchema.optional(),
  dedication: z.string().optional(),
  product_info: z.record(z.unknown()).optional(),
  shipping_tier: SHIPPING_TIER_ENUM.optional().default('mail'),
  // Multi-book
  books: z.array(BookItemSchema).min(1).max(5).optional(),
});

const DEFAULT_AMOUNT_CENTS = 2999; // $29.99

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  // Purpose: always return CORS headers, even on unexpected 500s (prevents browser "Failed to fetch").
  try {
    if (request.method !== 'POST') {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
    }

    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'Idempotency-Key header is required' }, { status: 400, headers: corsHeaders });
    }

    let parsed: z.infer<typeof BodySchema>;
    try {
      const body = await request.json();
      parsed = BodySchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fields = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
        return NextResponse.json({ error: 'Validation failed', fields }, { status: 400, headers: corsHeaders });
      }
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
    }

    if (parsed.shipping_address.country !== 'US') {
      return NextResponse.json(
        { error: 'Validation failed', fields: [{ path: 'shipping_address.country', message: 'Phase 0 supports US only' }] },
        { status: 400, headers: corsHeaders }
      );
    }

    // Purpose: build Stripe redirect URLs. Prefer env, fall back to allowed request Origin.
    const configuredOrigin = (process.env.D2C_FRONTEND_ORIGIN ?? '').trim();
    const requestOrigin = (request.headers.get('origin') ?? '').trim();
    const isAllowedRequestOrigin =
      requestOrigin === 'https://littleherolabs.com' ||
      requestOrigin.endsWith('.littleherolabs.com') ||
      /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin);
    const frontendOrigin = configuredOrigin || (isAllowedRequestOrigin ? requestOrigin : '');
    if (!frontendOrigin) {
      console.error('[Checkout] Missing D2C_FRONTEND_ORIGIN and request Origin not allowed');
      return NextResponse.json({ error: 'Checkout configuration error' }, { status: 500, headers: corsHeaders });
    }

    const response = await withIdempotency(
      idempotencyKey,
      async () => {
        const root_order_id = crypto.randomUUID();
        const display_order_id = `LH-${root_order_id.substring(0, 5).toUpperCase()}`;
        const shippingTier = parsed.shipping_tier as ShippingTier;
        const now = new Date().toISOString();

        // Normalize into a books array (backward-compatible with single-book)
        const bookInputs: Array<{ character_specs: Record<string, unknown>; dedication?: string }> = [];
        if (parsed.books && parsed.books.length > 0) {
          for (const b of parsed.books) {
            bookInputs.push({ character_specs: b.character_specs as Record<string, unknown>, dedication: b.dedication });
          }
        } else if (parsed.character_specs) {
          bookInputs.push({ character_specs: parsed.character_specs as Record<string, unknown>, dedication: parsed.dedication });
        } else {
          throw new Error('Validation failed');
        }

        const isSingleBook = bookInputs.length === 1;
        // For single book: use root_order_id directly (backward compat)
        // For multi-book: each book gets root-item-{index}
        const orderIds: string[] = [];

        for (let i = 0; i < bookInputs.length; i++) {
          const { character_specs: rawSpecs, dedication } = bookInputs[i];
          const orderId = isSingleBook
            ? root_order_id
            : buildSiblingOrderId(root_order_id, String(i + 1));
          orderIds.push(orderId);

          const character_specs = {
            ...rawSpecs,
            childName: rawSpecs.childName ?? rawSpecs.name,
            animalGuide: rawSpecs.animalGuide ?? rawSpecs.favoriteAnimal,
            clothingStyle: rawSpecs.clothingStyle ?? inferClothingFromPronouns(rawSpecs.pronouns),
          };

          const character_hash = calculateCharacterHash(character_specs, orderId);
          const preview_hash = calculatePreviewHash(character_specs);
          const childName = character_specs.childName as string;

          const book_specs = {
            title: `${childName} and the Adventure Compass`,
            totalPages: 16,
            format: '8.5x8.5_softcover',
            bookType: 'adventure',
          };

          const product_info = {
            ...book_specs,
            ...parsed.product_info,
            ...(!isSingleBook ? { _sibling_order: i > 0, _root_order_id: root_order_id } : {}),
          };

          const orderPayload = {
            orderId,
            display_order_id: isSingleBook ? display_order_id : `${display_order_id}-${i + 1}`,
            platform: 'd2c',
            root_order_id: root_order_id,
            amazon_order_id: null,
            customer_email: parsed.customer_email,
            customer_name: parsed.customer_name ?? parsed.shipping_address.name ?? null,
            shipping_address: parsed.shipping_address,
            shipping_tier: shippingTier,
            character_specs,
            character_hash,
            preview_hash,
            dedication_text: dedication ?? null,
            book_specs,
            product_info,
            status: 'pending_payment',
            execution_status: 'pending_payment',
            next_workflow: null,
            created_at: now,
            updated_at: now,
          };

          const { error: insertError } = await supabase.from('orders').insert(orderPayload).select().single();
          if (insertError) {
            console.error(`[Checkout] Order insert failed for book ${i + 1}:`, insertError.message);
            throw new Error('Failed to create order');
          }
        }

        const stripeSecretKey = process.env.STRIPE_SANDBOX_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
          console.error('[Checkout] STRIPE_SANDBOX_SECRET_KEY or STRIPE_SECRET_KEY not configured');
          throw new Error('Payment configuration error');
        }

        const bookCents = parseInt(process.env.D2C_CHECKOUT_AMOUNT_CENTS ?? '', 10) || DEFAULT_AMOUNT_CENTS;
        const shippingCents = SHIPPING_CENTS_BY_TIER[shippingTier];
        const shippingLabel = SHIPPING_LABEL_BY_TIER[shippingTier];

        const stripe = new Stripe(stripeSecretKey, {
          httpClient: Stripe.createFetchHttpClient(),
          maxNetworkRetries: 2,
        });

        // One Stripe line item per book + one for shipping
        const bookLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = bookInputs.map((b, i) => {
          const name = (b.character_specs.childName ?? b.character_specs.name ?? 'Child') as string;
          return {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: bookCents,
              product_data: {
                name: bookInputs.length === 1
                  ? 'Little Hero Book \u2014 Personalized Children\'s Book'
                  : `Little Hero Book \u2014 ${name}'s Book`,
                description: `Custom storybook starring ${name} as the hero.`,
              },
            },
          };
        });

        const successUrl = `${frontendOrigin}/create/processing?order_id=${encodeURIComponent(isSingleBook ? root_order_id : root_order_id)}`;
        const cancelUrl = `${frontendOrigin}/create/checkout`;

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [
            ...bookLineItems,
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: shippingCents,
                product_data: {
                  name: `Shipping \u2014 ${shippingLabel}`,
                  description: 'Delivery to your address.',
                },
              },
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: isSingleBook
            ? { order_id: root_order_id }
            : { root_order_id, book_count: String(bookInputs.length) },
          customer_email: parsed.customer_email,
        });

        if (!session.url) {
          throw new Error('Stripe did not return checkout session URL');
        }

        return {
          status: 201,
          body: {
            order_id: root_order_id,
            order_ids: orderIds,
            display_order_id,
            book_count: bookInputs.length,
            stripe_checkout_session_url: session.url,
          },
        };
      },
      { ttlHours: 24 }
    );

    return NextResponse.json(response.body, { status: response.status, headers: corsHeaders });
  } catch (err) {
    console.error('[Checkout] Unhandled error:', err);
    // Purpose: return a safe, actionable message (and keep CORS headers) so the frontend doesn't show "Failed to fetch".
    const safeMessage =
      err instanceof Error &&
      [
        'Checkout configuration error',
        'Payment configuration error',
        'Failed to create order',
        'Stripe did not return checkout session URL',
      ].includes(err.message)
        ? err.message
        : 'Checkout failed';
    return NextResponse.json({ error: safeMessage }, { status: 500, headers: corsHeaders });
  }
}
