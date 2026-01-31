/**
 * Create a sibling order from a local customization JSON file (no Amazon download).
 * Use when the customization URL returns 403.
 *
 * Usage (run from back-end directory):
 *   npm run create-sibling-from-json -- 114-7080737-5512234 /path/to/152767221929961.json 152767221929961
 *
 * Or: npx dotenv -e .env.local -- tsx scripts/create-sibling-from-json-file.ts <orderId> <path-to-json> <order_item_id>
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { parseAmazonCustomization } from '../src/lib/amazon-customization-parser';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL;

async function main() {
  const args = process.argv.slice(2);
  const orderIdArg = args[0];
  const jsonPath = args[1];
  const orderItemIdArg = args[2];

  if (!orderIdArg || !jsonPath) {
    console.error('Usage: tsx scripts/create-sibling-from-json-file.ts <orderId> <path-to-json> [order_item_id]');
    console.error('  orderId: existing order ID (e.g. 114-7080737-5512234)');
    console.error('  path-to-json: path to customization JSON (e.g. /Users/.../152767221929961.json)');
    console.error('  order_item_id: optional (e.g. 152767221929961); used for synthetic order id');
    process.exit(1);
  }

  const parentOrderId = orderIdArg.trim();
  const orderItemId = orderItemIdArg?.trim() || null;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: npx dotenv -e .env.local -- tsx scripts/...');
    process.exit(1);
  }

  let customizationData: unknown;
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    customizationData = JSON.parse(raw);
  } catch (e: any) {
    console.error('Failed to read or parse JSON file:', e?.message);
    process.exit(1);
  }

  const characterSpecs = parseAmazonCustomization(customizationData as any);
  if (!characterSpecs) {
    console.error('Failed to parse customization JSON (expected Amazon customization format)');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('amazon_order_id', parentOrderId)
    .maybeSingle();

  if (fetchError || !order) {
    const { data: byOrderId } = await supabase.from('orders').select('*').eq('orderId', parentOrderId).maybeSingle();
    if (!byOrderId) {
      console.error('Order not found:', parentOrderId);
      process.exit(1);
    }
    Object.assign(order, byOrderId);
  }

  const characterHashSpec = {
    clothingStyle: (characterSpecs as Record<string, unknown>).clothingStyle || 't-shirt and shorts',
    favoriteColor: (characterSpecs as Record<string, unknown>).favoriteColor || 'blue',
    hairColor: (characterSpecs as Record<string, unknown>).hairColor || 'brown',
    hairStyle: (characterSpecs as Record<string, unknown>).hairStyle || 'short/straight',
    skinTone: (characterSpecs as Record<string, unknown>).skinTone || 'medium',
  };
  const characterHash = createHash('sha256').update(JSON.stringify(characterHashSpec)).digest('hex').substring(0, 16);

  const syntheticOrderId = orderItemId
    ? `${parentOrderId}-item-${orderItemId}`
    : `${parentOrderId}-item-${Date.now()}`;

  const now = new Date().toISOString();
  const siblingOrder = {
    orderId: syntheticOrderId,
    amazon_order_id: syntheticOrderId,
    platform: order.platform ?? 'amazon',
    shipping_address: order.shipping_address,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    character_specs: characterSpecs,
    character_hash: characterHash,
    dedication_text: (characterSpecs as Record<string, unknown>).dedication ?? order.dedication_text ?? null,
    status: 'new',
    execution_status: 'pending_w0',
    next_workflow: null,
    workflow_step: null,
    marketplace_id: order.marketplace_id ?? 'ATVPDKIKX0DER',
    purchase_date: order.purchase_date ?? now,
    product_info: {
      _sibling_order: true,
      _parent_amazon_order_id: parentOrderId,
      _order_item_id: orderItemId,
      line_items: orderItemId ? [{ order_item_id: orderItemId, customization_url: null }] : [],
    },
    created_at: now,
    updated_at: now,
  };

  const { error: insertError } = await supabase.from('orders').insert(siblingOrder).select().single();

  if (insertError) {
    console.error('Failed to insert sibling order:', insertError.message);
    process.exit(1);
  }

  console.log('Created sibling order:', syntheticOrderId);

  if (!n8nW0WebhookUrl) {
    console.warn('N8N_W0_WEBHOOK_URL not set. Trigger W0 manually for order:', syntheticOrderId);
    process.exit(0);
  }

  let shippingAddress = order.shipping_address;
  if (typeof shippingAddress === 'string') {
    try {
      shippingAddress = JSON.parse(shippingAddress);
    } catch {
      shippingAddress = null;
    }
  }

  const w0Payload = {
    amazonOrderId: syntheticOrderId,
    orderId: syntheticOrderId,
    id: syntheticOrderId,
    orderDate: order.purchase_date ?? now,
    purchaseDate: order.purchase_date ?? now,
    status: 'pending_w0',
    marketplaceId: order.marketplace_id ?? 'ATVPDKIKX0DER',
    customerEmail: order.customer_email,
    buyer: { email: order.customer_email, name: order.customer_name },
    shippingAddress,
    characterSpecs: characterSpecs,
    character_specs: characterSpecs,
    CharacterSpecs: characterSpecs,
    bookSpecs: {
      title: `${(characterSpecs as Record<string, unknown>).childName ?? 'Child'} and the Adventure Compass`,
      totalPages: 16,
      format: '8.5x8.5_softcover',
      bookType: 'adventure',
    },
    orderDetails: { quantity: 1, shippingAddress },
    dedication: (characterSpecs as Record<string, unknown>).dedication ?? order.dedication_text ?? null,
    Dedication: (characterSpecs as Record<string, unknown>).dedication ?? order.dedication_text ?? null,
    items: [],
    characterHash,
    character_hash: characterHash,
  };

  const w0Response = await fetch(n8nW0WebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(w0Payload),
  });

  if (!w0Response.ok) {
    console.error('W0 webhook failed:', w0Response.status, await w0Response.text());
    process.exit(1);
  }

  console.log('W0 triggered for sibling order:', syntheticOrderId);
  console.log('Done. Sibling order is in the pipeline.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
