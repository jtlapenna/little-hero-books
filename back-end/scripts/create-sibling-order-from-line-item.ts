/**
 * Create a sibling order for a second (or later) line item from the same Amazon order.
 * Use this when one order has multiple items but our pipeline only processes one book per order.
 *
 * Usage (run from back-end directory so dotenv-cli is used):
 *   npm run create-sibling -- 114-7080737-5512234
 *
 *   # Or from repo root: cd back-end && npm run create-sibling -- 114-7080737-5512234
 *
 *   # If the order does NOT have line_items, pass the second item's customization URL:
 *   npm run create-sibling -- 114-7080737-5512234 -- --url "https://zme-caps.amazon.com/t/..."
 *
 * The script will:
 * 1. Load the existing order from Supabase.
 * 2. Get the second line item's customization URL (from product_info.line_items[1] or --url).
 * 3. Download and parse that URL for character_specs.
 * 4. Create a new order row with a synthetic orderId (e.g. 114-7080737-5512234-item-152767221930001).
 * 5. Trigger W0 for the new order so it enters the pipeline.
 *
 * Result: Two orders in the backend (original + sibling). Each will get its own manifest and Lulu job
 * (two shipments) until we implement multi-item Lulu support.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { downloadAndExtractCustomizationZip } from '../src/lib/zip-downloader';
import { parseAmazonCustomization } from '../src/lib/amazon-customization-parser';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL;

async function main() {
  const args = process.argv.slice(2);
  const orderIdArg = args.find((a) => !a.startsWith('--'));
  const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

  if (!orderIdArg) {
    console.error('Usage: tsx scripts/create-sibling-order-from-line-item.ts <orderId> [--url <customization-url>]');
    console.error('  orderId: existing order ID (e.g. 114-7080737-5512234)');
    console.error('  --url: optional; second item customization URL (required if order has no product_info.line_items)');
    process.exit(1);
  }

  const parentOrderId = orderIdArg.trim();

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: npx dotenv -e .env.local -- tsx scripts/...');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Fetch existing order (try orderId first, then amazon_order_id)
  let order: Record<string, unknown> | null = null;
  const { data: byOrderId } = await supabase.from('orders').select('*').eq('orderId', parentOrderId).maybeSingle();
  if (byOrderId) order = byOrderId as Record<string, unknown>;
  if (!order) {
    const { data: byAmazonId } = await supabase.from('orders').select('*').eq('amazon_order_id', parentOrderId).maybeSingle();
    if (byAmazonId) order = byAmazonId as Record<string, unknown>;
  }

  if (!order) {
    console.error('Order not found:', parentOrderId);
    process.exit(1);
  }

  const productInfo = order.product_info as Record<string, unknown> | undefined;
  const lineItems = (productInfo?.line_items as Array<{ order_item_id?: string; customization_url?: string }>) ?? [];

  let customizationUrl: string | null = urlArg?.trim() || null;
  let orderItemId: string | null = null;

  if (lineItems.length >= 2) {
    const secondItem = lineItems[1];
    customizationUrl = secondItem?.customization_url ?? null;
    orderItemId = secondItem?.order_item_id ?? null;
    console.log('Using second line item from product_info.line_items:', { orderItemId, hasUrl: !!customizationUrl });
  }

  if (!customizationUrl) {
    console.error('No customization URL for the second item.');
    console.error('Either re-upload the CSV (so product_info.line_items is populated) or pass --url "https://..."');
    process.exit(1);
  }

  const syntheticOrderId = orderItemId
    ? `${parentOrderId}-item-${orderItemId}`
    : `${parentOrderId}-item-${Date.now()}`;

  // 2. Download and parse customization for the second item
  console.log('Downloading customization from:', customizationUrl.substring(0, 60) + '...');
  const customizationData = await downloadAndExtractCustomizationZip(customizationUrl);
  if (!customizationData) {
    console.error('Failed to download or extract customization ZIP');
    process.exit(1);
  }

  const characterSpecs = parseAmazonCustomization(customizationData);
  if (!characterSpecs) {
    console.error('Failed to parse customization JSON');
    process.exit(1);
  }

  const characterHashSpec = {
    clothingStyle: (characterSpecs as Record<string, unknown>).clothingStyle || 't-shirt and shorts',
    favoriteColor: (characterSpecs as Record<string, unknown>).favoriteColor || 'blue',
    hairColor: (characterSpecs as Record<string, unknown>).hairColor || 'brown',
    hairStyle: (characterSpecs as Record<string, unknown>).hairStyle || 'short/straight',
    skinTone: (characterSpecs as Record<string, unknown>).skinTone || 'medium',
  };
  const characterHash = createHash('sha256').update(JSON.stringify(characterHashSpec)).digest('hex').substring(0, 16);

  // 3. Build sibling order row (same shipping/customer, new character_specs; synthetic orderId/amazon_order_id)
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
      line_items: [{ order_item_id: orderItemId, customization_url: customizationUrl }],
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

  // 4. Trigger W0 so the sibling enters the pipeline
  if (!n8nW0WebhookUrl) {
    console.warn('N8N_W0_WEBHOOK_URL not set. Trigger W0 manually for order:', syntheticOrderId);
    console.log('  e.g. POST /api/admin/orders/' + encodeURIComponent(syntheticOrderId) + '/trigger-w0');
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
  console.log('Done. Both items are now in the pipeline (two orders; two Lulu jobs = two shipments until multi-item is implemented).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
