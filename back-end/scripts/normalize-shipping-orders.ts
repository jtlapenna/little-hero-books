/**
 * Normalize shipping_address for orders (address_line1 -> address_line_1, etc.)
 * and clear missing_shipping error flags.
 *
 * Usage (run from back-end directory):
 *   npx dotenv -e .env.local -- tsx scripts/normalize-shipping-orders.ts LH-E0790-1 LH-E0790-2 LH-E0790-3
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

function normalizeShippingAddress(shippingAddress: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...shippingAddress };
  if (normalized.address && !normalized.address_line_1) {
    normalized.address_line_1 = normalized.address;
  }
  if (normalized.address_line1 && !normalized.address_line_1) {
    normalized.address_line_1 = normalized.address_line1;
  }
  if (normalized.address_line2 && !normalized.address_line_2) {
    normalized.address_line_2 = normalized.address_line2;
  }
  if (normalized.zip && !normalized.postal_code) {
    normalized.postal_code = normalized.zip;
  }
  if (normalized.state && !normalized.state_code) {
    normalized.state_code = normalized.state;
  }
  if (normalized.address2 && !normalized.address_line_2) {
    normalized.address_line_2 = normalized.address2;
  }
  return normalized;
}

async function main() {
  const orderIds = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (orderIds.length === 0) {
    console.error('Usage: npx dotenv -e .env.local -- tsx scripts/normalize-shipping-orders.ts <orderId> [orderId...]');
    process.exit(1);
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  for (const orderId of orderIds) {
    const { data: rows, error: fetchError } = await supabase
      .from('orders')
      .select('id, orderId, shipping_address, review_stages')
      .eq('orderId', orderId)
      .limit(1);
    if (fetchError) {
      console.error(`[${orderId}] Fetch error:`, fetchError.message);
      continue;
    }
    const o = Array.isArray(rows) ? rows[0] : rows;
    if (!o) {
      console.error(`[${orderId}] Order not found`);
      continue;
    }

    const shippingAddress = o.shipping_address;
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      console.error(`[${orderId}] No shipping_address`);
      continue;
    }

    const normalized = normalizeShippingAddress(shippingAddress as Record<string, unknown>);
    const dbId = o.id;
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        shipping_address: normalized,
        error_type: null,
        error_message: null,
      })
      .eq('id', dbId);

    if (updateError) {
      console.error(`[${orderId}] Update error:`, updateError.message);
      continue;
    }
    console.log(`[${orderId}] OK - normalized shipping, cleared error flags`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
