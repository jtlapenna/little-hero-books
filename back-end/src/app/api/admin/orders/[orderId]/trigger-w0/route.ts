import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { inferBookIdHintFromOrderLike } from '@/lib/order-paths';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
// W0 webhook URL - must be set in Vercel environment variables
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-sibtest';

function trimToString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const orderId = params.orderId;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch order: support id (numeric) or amazon_order_id / orderId (string)
    const numericId = parseInt(orderId, 10);
    const byId = !isNaN(numericId) && String(numericId) === orderId;
    let order: Record<string, unknown> | null = null;
    let fetchError: unknown = null;
    if (byId) {
      const r = await supabase.from('orders').select('*').eq('id', numericId).single();
      order = (r.data as Record<string, unknown> | null) ?? null;
      fetchError = r.error;
    } else {
      // Purpose: prefer per-book id lookup; amazon_order_id can be a group key.
      const r1 = await supabase.from('orders').select('*').eq('orderId', orderId).maybeSingle();
      if (!r1.error && r1.data) {
        order = r1.data as Record<string, unknown>;
      } else if (r1.error && r1.error.code !== '42703') {
        fetchError = r1.error;
      } else {
        const r2 = await supabase.from('orders').select('*').eq('order_id', orderId).maybeSingle();
        if (!r2.error && r2.data) {
          order = r2.data as Record<string, unknown>;
        } else if (r2.error && r2.error.code !== '42703') {
          fetchError = r2.error;
        } else {
          const r3 = await supabase.from('orders').select('*').eq('amazon_order_id', orderId).limit(50);
          if (r3.error) {
            fetchError = r3.error;
          } else if (r3.data && r3.data.length > 0) {
            order =
              (r3.data as any[]).find((o) => String(o?.orderId ?? '').trim() === orderId) ??
              (r3.data as any[])[0];
          }
        }
      }
    }

    if (!order) {
      const msg =
        fetchError instanceof Error
          ? fetchError.message
          : (fetchError as any)?.message || 'Not found';
      return NextResponse.json(
        { error: `Order not found: ${msg}` },
        { status: 404 }
      );
    }

    // Parse JSONB fields
    const shippingAddress = parseJsonRecord((order as any).shipping_address);
    const characterSpecs = parseJsonRecord((order as any).character_specs);
    const productInfo =
      parseJsonRecord((order as any).product_info) ??
      parseJsonRecord((order as any).productInfo) ??
      {};
    const existingBookSpecs =
      parseJsonRecord((order as any).book_specs) ??
      parseJsonRecord((order as any).bookSpecs) ??
      parseJsonRecord((productInfo as any).bookSpecs) ??
      parseJsonRecord((productInfo as any).book_specs) ??
      {};
    const bookId =
      trimToString((existingBookSpecs as any).bookId) ??
      trimToString((existingBookSpecs as any).book_id) ??
      trimToString((productInfo as any).bookId) ??
      trimToString((productInfo as any).book_id) ??
      inferBookIdHintFromOrderLike(order) ??
      undefined;
    const formatId =
      trimToString((existingBookSpecs as any).formatId) ??
      trimToString((existingBookSpecs as any).format_id) ??
      trimToString((productInfo as any).formatId) ??
      trimToString((productInfo as any).format_id) ??
      undefined;

    // Validate data
    const hasShipping = shippingAddress && 
      typeof shippingAddress === 'object' && 
      !Array.isArray(shippingAddress) &&
      shippingAddress !== null &&
      Object.keys(shippingAddress).length > 0;

    const hasCharacterSpecs = characterSpecs && 
      typeof characterSpecs === 'object' && 
      !Array.isArray(characterSpecs) &&
      characterSpecs !== null &&
      Object.keys(characterSpecs).length > 0;

    if (!hasShipping || !hasCharacterSpecs) {
      return NextResponse.json(
        { 
          error: 'Order missing required data',
          hasShipping,
          hasCharacterSpecs,
          shippingAddress: shippingAddress ? Object.keys(shippingAddress) : null,
          characterSpecs: characterSpecs ? Object.keys(characterSpecs) : null,
        },
        { status: 400 }
      );
    }

    // Calculate character_hash if missing
    let characterHash = (order as any).character_hash;
    if (!characterHash && characterSpecs) {
      const orderIdValue = (order as any).orderId || (order as any).amazon_order_id;
      const sortedSpecs = Object.keys(characterSpecs)
        .sort()
        .reduce((acc, key) => {
          acc[key] = characterSpecs[key];
          return acc;
        }, {} as Record<string, any>);
      const hashInput = JSON.stringify({ ...sortedSpecs, orderId: orderIdValue });
      characterHash = createHash('md5').update(hashInput).digest('hex').substring(0, 16);
      
      // Save character_hash to Supabase if it was just calculated
      console.log(`[Trigger W0] Saving character_hash to Supabase: ${characterHash}`);
      await supabase
        .from('orders')
        .update({ character_hash: characterHash })
        .eq('id', (order as any).id);
    }

    // Build W0 payload
    const w0Payload = {
      amazonOrderId: (order as any).amazon_order_id,
      orderId: (order as any).orderId || (order as any).amazon_order_id,
      id: (order as any).orderId || (order as any).amazon_order_id,
      orderDate: (order as any).purchase_date,
      purchaseDate: (order as any).purchase_date,
      status: 'pending_w0',
      marketplaceId: (order as any).marketplace_id,
      customerEmail: (order as any).customer_email,
      buyer: {
        email: (order as any).customer_email,
        name: (order as any).customer_name,
      },
      shippingAddress: shippingAddress,
      characterSpecs: characterSpecs,
      character_specs: characterSpecs,
      CharacterSpecs: characterSpecs,
      bookSpecs: {
        ...existingBookSpecs,
        title:
          (existingBookSpecs as any).title ??
          (productInfo as any).title ??
          `${(characterSpecs as any)?.childName || 'Child'} and the Adventure Compass`,
        totalPages:
          (existingBookSpecs as any).totalPages ??
          (productInfo as any).totalPages ??
          16,
        format:
          (existingBookSpecs as any).format ??
          (productInfo as any).format ??
          '8.5x8.5_softcover',
        bookType:
          (existingBookSpecs as any).bookType ??
          (productInfo as any).bookType ??
          'adventure',
        ...(bookId ? { bookId } : {}),
        ...(formatId ? { formatId } : {}),
      },
      ...(bookId ? { bookId, book_id: bookId } : {}),
      ...(formatId ? { formatId, format_id: formatId } : {}),
      orderDetails: {
        quantity: 1,
        shippingAddress: shippingAddress,
      },
      dedication: characterSpecs?.dedication || order.dedication_text || null,
      Dedication: characterSpecs?.dedication || order.dedication_text || null,
      items: Array.isArray(order.product_info) ? order.product_info : [],
      characterHash: characterHash,
      character_hash: characterHash,
    };

    // Call W0 webhook
    console.log(`[Trigger W0] Calling webhook: ${n8nW0WebhookUrl}`);
    const w0Response = await fetch(n8nW0WebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(w0Payload),
    });

    const responseText = await w0Response.text();

    if (!w0Response.ok) {
      return NextResponse.json(
        {
          error: 'W0 webhook failed',
          status: w0Response.status,
          webhookUrl: n8nW0WebhookUrl,
          response: responseText.substring(0, 500),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'W0 triggered successfully',
      orderId: order.amazon_order_id,
      webhookUrl: n8nW0WebhookUrl,
      status: w0Response.status,
      response: responseText ? (() => {
        try {
          return JSON.parse(responseText);
        } catch (e) {
          return responseText.substring(0, 500);
        }
      })() : null,
    });

  } catch (error: any) {
    console.error('[Trigger W0] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
