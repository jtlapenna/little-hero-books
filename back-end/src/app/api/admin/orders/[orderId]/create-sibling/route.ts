import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabase } from '@/lib/supabase-client';
import { parseAmazonCustomization } from '@/lib/amazon-customization-parser';

export const dynamic = 'force-dynamic';

/**
 * Create a sibling order from pasted customization JSON (no Amazon download).
 * Use when the customization URL returns 403 from your machine or the server.
 *
 * POST /api/admin/orders/[orderId]/create-sibling
 * Body: { customization_json: { ... } }  — raw JSON from the Amazon customization ZIP
 *   OR  { character_specs: { childName, age, pronouns, skinTone, hairColor, hairStyle, favoriteColor, animalGuide, dedication?, hometown? }, order_item_id?: string }
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  return (
    !origin ||
    origin.includes(siteUrl) ||
    referer?.includes(siteUrl) ||
    origin.includes('littleherolabs.com') ||
    referer?.includes('littleherolabs.com')
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId: parentOrderId } = await params;
  const orderIdValue = String(parentOrderId || '').trim();
  if (!orderIdValue) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  let body: {
    customization_json?: Record<string, unknown>;
    character_specs?: Record<string, unknown>;
    order_item_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let characterSpecs: Record<string, unknown>;
  if (body.character_specs && typeof body.character_specs === 'object') {
    characterSpecs = body.character_specs as Record<string, unknown>;
    if (!characterSpecs.childName) {
      return NextResponse.json(
        { error: 'character_specs must include childName (and age)' },
        { status: 400 }
      );
    }
  } else if (body.customization_json && typeof body.customization_json === 'object') {
    const parsed = parseAmazonCustomization(body.customization_json as any);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Could not parse customization_json; ensure it is the JSON from the Amazon customization ZIP' },
        { status: 400 }
      );
    }
    characterSpecs = parsed as Record<string, unknown>;
  } else {
    return NextResponse.json(
      { error: 'Body must include customization_json (raw Amazon ZIP JSON) or character_specs object' },
      { status: 400 }
    );
  }

  const orderItemId = typeof body.order_item_id === 'string' ? body.order_item_id.trim() : null;
  const syntheticOrderId = orderItemId
    ? `${orderIdValue}-item-${orderItemId}`
    : `${orderIdValue}-item-${Date.now()}`;

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('amazon_order_id', orderIdValue)
    .maybeSingle();

  if (fetchError || !order) {
    return NextResponse.json(
      { error: 'Order not found', orderId: orderIdValue },
      { status: 404 }
    );
  }

  const characterHashSpec = {
    clothingStyle: characterSpecs.clothingStyle || 't-shirt and shorts',
    favoriteColor: characterSpecs.favoriteColor || 'blue',
    hairColor: characterSpecs.hairColor || 'brown',
    hairStyle: characterSpecs.hairStyle || 'short/straight',
    skinTone: characterSpecs.skinTone || 'medium',
  };
  const characterHash = createHash('sha256')
    .update(JSON.stringify(characterHashSpec))
    .digest('hex')
    .substring(0, 16);

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
    dedication_text: characterSpecs.dedication ?? order.dedication_text ?? null,
    status: 'new',
    execution_status: 'pending_w0',
    next_workflow: null,
    workflow_step: null,
    marketplace_id: order.marketplace_id ?? 'ATVPDKIKX0DER',
    purchase_date: order.purchase_date ?? now,
    product_info: {
      _sibling_order: true,
      _parent_amazon_order_id: orderIdValue,
      _order_item_id: orderItemId,
      line_items: orderItemId ? [{ order_item_id: orderItemId, customization_url: null }] : [],
    },
    created_at: now,
    updated_at: now,
  };

  const { error: insertError } = await supabase
    .from('orders')
    .insert(siblingOrder)
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to create sibling order', details: insertError.message },
      { status: 500 }
    );
  }

  const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL;
  if (n8nW0WebhookUrl) {
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
        title: `${characterSpecs.childName ?? 'Child'} and the Adventure Compass`,
        totalPages: 16,
        format: '8.5x8.5_softcover',
        bookType: 'adventure',
      },
      orderDetails: { quantity: 1, shippingAddress },
      dedication: characterSpecs.dedication ?? order.dedication_text ?? null,
      Dedication: characterSpecs.dedication ?? order.dedication_text ?? null,
      items: [],
      characterHash,
      character_hash: characterHash,
    };
    const w0Res = await fetch(n8nW0WebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(w0Payload),
    });
    if (!w0Res.ok) {
      return NextResponse.json({
        success: true,
        orderId: orderIdValue,
        siblingOrderId: syntheticOrderId,
        w0Triggered: false,
        w0Error: `W0 webhook failed: ${w0Res.status} ${await w0Res.text()}`,
        message: 'Sibling order created. Trigger W0 manually for ' + syntheticOrderId,
      });
    }
  }

  return NextResponse.json({
    success: true,
    orderId: orderIdValue,
    siblingOrderId: syntheticOrderId,
    w0Triggered: !!n8nW0WebhookUrl,
    message: 'Sibling order created and W0 triggered.',
  });
}
