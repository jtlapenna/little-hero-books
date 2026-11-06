import { z } from 'zod';
import { calculateCharacterHash, calculatePreviewHash } from '@/lib/character-hash';
import { buildSiblingOrderId } from '@/lib/sibling-order-helpers';
import type Stripe from 'stripe';

function trimToString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Infer clothing style from pronouns (matches Amazon order logic).
 * Default: t-shirt and shorts for neutral/masculine pronouns, dress for feminine.
 */
function inferClothingFromPronouns(pronouns: unknown): string {
  if (pronouns === 'she-her') return 'dress';
  return 't-shirt and shorts';
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

/** Base shipping (cents) for 1 book, by tier. Multi-book scales per Lulu/observed data. */
const SHIPPING_BASE_CENTS: Record<ShippingTier, number> = {
  mail: 599,
  ground_home: 1299,
  priority_mail: 1499,
  expedited: 2099,
  express: 3099,
};
/** Extra cents per additional book (2nd, 3rd, …). Lulu express: 1→$30.99, 3→$38.24 ⇒ ~$3.63/book. */
const SHIPPING_INCREMENT_PER_BOOK: Record<ShippingTier, number> = {
  mail: 200,
  ground_home: 250,
  priority_mail: 275,
  expedited: 300,
  express: 363,
};
/** Lulu fulfillment fee per order (cents). Added to shipping line. */
const FULFILLMENT_FEE_CENTS = 75;

/** Shipping + fulfillment total (cents) for Stripe. Must match frontend display. */
function getShippingAndFulfillmentCents(tier: ShippingTier, bookCount: number): number {
  const base = SHIPPING_BASE_CENTS[tier];
  const increment = SHIPPING_INCREMENT_PER_BOOK[tier];
  const extraBooks = Math.max(0, bookCount - 1);
  const shippingCents = base + extraBooks * increment;
  return shippingCents + FULFILLMENT_FEE_CENTS;
}

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

const ProductInfoSchema = z.object({}).catchall(z.unknown());

const BodySchema = z.object({
  shipping_address: ShippingAddressSchema,
  customer_email: z.string().email(),
  customer_name: z.string().optional(),
  // Single book (backward compat)
  character_specs: CharacterSpecsSchema.optional(),
  dedication: z.string().optional(),
  product_info: ProductInfoSchema.optional(),
  shipping_tier: SHIPPING_TIER_ENUM.optional().default('mail'),
  // Multi-book
  books: z.array(BookItemSchema).min(1).max(5).optional(),
});

const DEFAULT_AMOUNT_CENTS = 2999; // $29.99

export type CheckoutBody = z.infer<typeof BodySchema>;
type BookInput = { character_specs: Record<string, unknown>; dedication?: string };

// V1 reproduces current checkout behavior. It is not an authoritative payment binding.
export const checkoutPreparationV1 = {
  parse(body: unknown): CheckoutBody { return BodySchema.parse(body); },
  resolveProduct(parsed: CheckoutBody, defaultBookId: string, defaultFormatId: string) {
    const requestedProductInfo = (parsed.product_info ?? {}) as Record<string, unknown>;
    const requestedBookId = trimToString(requestedProductInfo.bookId) ?? trimToString(requestedProductInfo.book_id) ?? defaultBookId;
    const requestedFormatId = trimToString(requestedProductInfo.formatId) ?? trimToString(requestedProductInfo.format_id) ?? defaultFormatId;
    return { requestedProductInfo, requestedBookId, requestedFormatId };
  },
  bookInputs(parsed: CheckoutBody): BookInput[] {
    const inputs: BookInput[] = [];
    if (parsed.books && parsed.books.length > 0) {
      for (const b of parsed.books) inputs.push({ character_specs: b.character_specs as Record<string, unknown>, dedication: b.dedication });
    } else if (parsed.character_specs) {
      inputs.push({ character_specs: parsed.character_specs as Record<string, unknown>, dedication: parsed.dedication });
    } else {
      throw new Error('Validation failed');
    }
    return inputs;
  },
  order(args: {
    parsed: CheckoutBody; bookInputs: BookInput[]; index: number; rootOrderId: string; displayOrderId: string;
    shippingTier: ShippingTier; now: string; requestedProductInfo: Record<string, unknown>;
    resolvedBookId: string; resolvedFormatId: string; innerVoicePageCount: number | null; innerVoiceConfigVersion: number | null;
  }) {
    const { parsed, bookInputs, index: i, rootOrderId, displayOrderId, shippingTier, now,
      requestedProductInfo, resolvedBookId, resolvedFormatId, innerVoicePageCount, innerVoiceConfigVersion } = args;
    const { character_specs: rawSpecs, dedication } = bookInputs[i];
    const isSingleBook = bookInputs.length === 1;
    const orderId = isSingleBook ? rootOrderId : buildSiblingOrderId(rootOrderId, String(i + 1));
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
      title: innerVoicePageCount !== null ? 'Finding Our Inner Voice' : `${childName} and the Adventure Compass`,
      totalPages: innerVoicePageCount ?? 16,
      format: innerVoicePageCount !== null ? resolvedFormatId : '8.5x8.5_softcover',
      bookType: innerVoicePageCount !== null ? 'inner-voice' : 'adventure',
      bookId: resolvedBookId,
      formatId: resolvedFormatId,
      ...(innerVoiceConfigVersion !== null ? { configVersion: innerVoiceConfigVersion } : {}),
    };
    const product_info = {
      ...requestedProductInfo, ...book_specs, bookId: resolvedBookId, formatId: resolvedFormatId,
      ...(!isSingleBook ? { _sibling_order: i > 0, _root_order_id: rootOrderId } : {}),
    };
    const orderPayload = {
      orderId,
      display_order_id: isSingleBook ? displayOrderId : `${displayOrderId}-${i + 1}`,
      platform: 'd2c', root_order_id: rootOrderId, amazon_order_id: null,
      customer_email: parsed.customer_email,
      customer_name: parsed.customer_name ?? parsed.shipping_address.name ?? null,
      shipping_address: parsed.shipping_address, shipping_tier: shippingTier,
      character_specs, character_hash, preview_hash, dedication_text: dedication ?? null,
      book_specs, product_info, status: 'pending_payment', execution_status: 'pending_payment',
      next_workflow: null, workflow_step: null, marketplace_id: 'ATVPDKIKX0DER',
      purchase_date: now, created_at: now, updated_at: now,
    };
    return { orderId, orderPayload };
  },
  quote(bookInputs: BookInput[], tier: ShippingTier, configuredAmount: string | undefined) {
    const bookCents = parseInt(configuredAmount ?? '', 10) || DEFAULT_AMOUNT_CENTS;
    const shippingCents = getShippingAndFulfillmentCents(tier, bookInputs.length);
    const shippingLabel = SHIPPING_LABEL_BY_TIER[tier];
    return { shippingCents, shippingLabel, bookCents };
  },
  lineItems(bookInputs: BookInput[], bookCents: number): Stripe.Checkout.SessionCreateParams.LineItem[] {
    return bookInputs.map((b) => {
      const name = (b.character_specs.childName ?? b.character_specs.name ?? 'Child') as string;
      return {
        quantity: 1,
        price_data: {
          currency: 'usd', unit_amount: bookCents,
          product_data: {
            name: bookInputs.length === 1
              ? 'Little Hero Book \u2014 Personalized Children\'s Book'
              : `Little Hero Book \u2014 ${name}'s Book`,
            description: `Custom storybook starring ${name} as the hero.`,
          },
        },
      };
    });
  },
};
