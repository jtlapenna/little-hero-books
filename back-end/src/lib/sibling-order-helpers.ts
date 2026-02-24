/**
 * Shared helpers for creating sibling orders and building W0 payloads.
 * Used by CSV upload, create-sibling API, and D2C multi-book checkout.
 */

import { createHash } from 'crypto';

/** Generate a synthetic per-book orderId from a parent/root ID and a suffix. */
export function buildSiblingOrderId(
  parentOrderId: string,
  orderItemId?: string | null
): string {
  const suffix = orderItemId?.trim() || String(Date.now());
  return `${parentOrderId}-item-${suffix}`;
}

/** SHA-256-based character hash matching the create-sibling API convention. */
export function calculateSiblingCharacterHash(
  characterSpecs: Record<string, unknown>
): string {
  const spec = {
    clothingStyle: characterSpecs.clothingStyle || 't-shirt and shorts',
    favoriteColor: characterSpecs.favoriteColor || 'blue',
    hairColor: characterSpecs.hairColor || 'brown',
    hairStyle: characterSpecs.hairStyle || 'short/straight',
    skinTone: characterSpecs.skinTone || 'medium',
  };
  return createHash('sha256')
    .update(JSON.stringify(spec))
    .digest('hex')
    .substring(0, 16);
}

/** Build a Supabase order row for a sibling (or primary) book. */
export function buildSiblingOrderRow(opts: {
  orderId: string;
  parentOrderId: string;
  platform: string;
  shippingAddress: unknown;
  customerName: string | null;
  customerEmail: string | null;
  characterSpecs: Record<string, unknown>;
  characterHash: string;
  marketplaceId: string | null;
  purchaseDate: string | null;
  orderItemId?: string | null;
  isSibling?: boolean;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    orderId: opts.orderId,
    // Purpose: root_order_id is the canonical group key; amazon_order_id remains for legacy compatibility.
    root_order_id: opts.parentOrderId,
    amazon_order_id: opts.parentOrderId,
    platform: opts.platform,
    shipping_address: opts.shippingAddress,
    customer_name: opts.customerName,
    customer_email: opts.customerEmail,
    character_specs: opts.characterSpecs,
    character_hash: opts.characterHash,
    dedication_text:
      (opts.characterSpecs.dedication as string) ?? null,
    status: 'new',
    execution_status: 'pending_w0',
    next_workflow: null,
    workflow_step: null,
    marketplace_id: opts.marketplaceId ?? 'ATVPDKIKX0DER',
    purchase_date: opts.purchaseDate ?? now,
    product_info: {
      _created_via_csv: true,
      ...(opts.isSibling
        ? {
            _sibling_order: true,
            _parent_root_order_id: opts.parentOrderId,
            _parent_amazon_order_id: opts.parentOrderId,
            _order_item_id: opts.orderItemId ?? null,
          }
        : {}),
    },
    created_at: now,
    updated_at: now,
  };
}

/** Build W0 webhook payload for any order (Amazon or D2C, primary or sibling). */
export function buildW0Payload(opts: {
  orderId: string;
  amazonOrderId?: string | null;
  purchaseDate: string | null;
  marketplaceId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  shippingAddress: unknown;
  characterSpecs: Record<string, unknown>;
  characterHash: string;
  dedicationText?: string | null;
}): Record<string, unknown> {
  const sa =
    typeof opts.shippingAddress === 'string'
      ? (() => {
          try {
            return JSON.parse(opts.shippingAddress);
          } catch {
            return null;
          }
        })()
      : opts.shippingAddress;

  return {
    amazonOrderId: opts.amazonOrderId ?? opts.orderId,
    orderId: opts.orderId,
    id: opts.orderId,
    orderDate: opts.purchaseDate ?? new Date().toISOString(),
    purchaseDate: opts.purchaseDate ?? new Date().toISOString(),
    status: 'pending_w0',
    marketplaceId: opts.marketplaceId ?? 'ATVPDKIKX0DER',
    customerEmail: opts.customerEmail,
    buyer: {
      email: opts.customerEmail,
      name: opts.customerName,
    },
    shippingAddress: sa,
    characterSpecs: opts.characterSpecs,
    character_specs: opts.characterSpecs,
    CharacterSpecs: opts.characterSpecs,
    bookSpecs: {
      title: `${(opts.characterSpecs.childName as string) ?? 'Child'} and the Adventure Compass`,
      totalPages: 16,
      format: '8.5x8.5_softcover',
      bookType: 'adventure',
    },
    orderDetails: { quantity: 1, shippingAddress: sa },
    dedication:
      opts.dedicationText ??
      (opts.characterSpecs.dedication as string) ??
      null,
    Dedication:
      opts.dedicationText ??
      (opts.characterSpecs.dedication as string) ??
      null,
    items: [],
    characterHash: opts.characterHash,
    character_hash: opts.characterHash,
  };
}

/** Fire W0 webhook. Returns { ok, error? }. */
export async function triggerW0(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.N8N_W0_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'N8N_W0_WEBHOOK_URL not configured' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `W0 ${res.status}: ${text.substring(0, 200)}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
