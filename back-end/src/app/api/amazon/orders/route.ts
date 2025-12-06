import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';
import { createHash } from 'crypto';

/**
 * POST /api/amazon/orders
 * 
 * Receives normalized Amazon order data from the SP-API middleware.
 * Idempotent: uses amazonOrderId as the unique key.
 * 
 * Expected payload format (from middleware):
 * {
 *   amazonOrderId: string,
 *   orderId: string,
 *   purchaseDate: string,
 *   orderStatus: string,
 *   marketplaceId: string,
 *   buyer: { email, name } | null,
 *   shippingAddress: { name, address, city, state, zip, country, phone } | null,
 *   items: Array<{ orderItemId, asin, sku, title, quantity, price, customization }>,
 *   customization: Record<string, any>,
 *   _raw: { order, items, buyerInfo, shippingAddress }
 * }
 */
async function postAmazonOrder(request: NextRequest) {
  console.log('[POST /api/amazon/orders] Received normalized Amazon order');

  try {
    const json = await request.json();
    
    // Extract Amazon order ID (required for idempotency)
    const amazonOrderId = json.amazonOrderId || json.orderId || json.id;
    if (!amazonOrderId) {
      throw createValidationError('Missing amazonOrderId. Required field for idempotency.');
    }

    // Trim order ID to prevent trailing space issues
    const orderIdValue = String(amazonOrderId).trim();
    if (!orderIdValue || orderIdValue.length === 0) {
      throw createValidationError('Invalid amazonOrderId: cannot be empty after trimming.');
    }

    // Extract customization data from normalized payload
    const customization = json.customization || json.items?.[0]?.customization || {};
    
    // Parse character specs from customization
    const getField = (keys: string[]): string | null => {
      for (const key of keys) {
        const value = customization[key];
        if (value !== undefined && value !== null && value !== '') {
          return String(value);
        }
      }
      return null;
    };

    const characterSpecs = {
      childName: getField(['Child\'s Name', 'Child Name', 'childName', 'ChildName']) || 'Hero',
      age: parseInt(getField(['Child\'s Age', 'Child Age', 'age', 'Age']) || '5', 10),
      pronouns: getField(['Pronouns', 'pronouns']) || 'they/them',
      skinTone: (getField(['Skin Tone', 'skinTone', 'SkinTone']) || 'medium').toLowerCase(),
      hairColor: (getField(['Hair Color', 'hairColor', 'HairColor']) || 'brown').toLowerCase(),
      hairStyle: (getField(['Hair Style', 'hairStyle', 'HairStyle']) || 'short/straight').toLowerCase(),
      favoriteColor: (getField(['Favorite Color', 'favoriteColor', 'FavoriteColor']) || 'blue').toLowerCase(),
      animalGuide: getField(['Animal Guide', 'animalGuide', 'AnimalGuide']) || 'dog',
      clothingStyle: (getField(['Clothing Style', 'clothingStyle', 'ClothingStyle']) || 't-shirt and shorts').toLowerCase(),
      hometown: getField(['Hometown', 'hometown', 'Home Town']) || null,
      dedication: getField(['Dedication Message', 'dedication', 'Dedication']) || '',
    };

    // Calculate character hash (includes orderId to ensure uniqueness per order)
    const sortedSpecs = Object.keys(characterSpecs)
      .sort()
      .reduce((acc, key) => {
        acc[key] = characterSpecs[key as keyof typeof characterSpecs];
        return acc;
      }, {} as Record<string, any>);
    
    const hashInput = JSON.stringify({ ...sortedSpecs, orderId: orderIdValue });
    const characterHash = createHash('md5')
      .update(hashInput)
      .digest('hex')
      .substring(0, 16);

    // Normalize shipping address
    const shippingAddress = json.shippingAddress || json._raw?.shippingAddress || json._raw?.order?.ShippingAddress || {
      name: json.buyer?.name || null,
      address: null,
      city: null,
      state: null,
      zip: null,
      country: 'US',
      phone: null,
    };

    // Build order data for Supabase
    const orderData: any = {
      orderId: orderIdValue, // Primary key
      amazon_order_id: orderIdValue, // Unique constraint
      character_hash: characterHash,
      order_status: json.orderStatus || 'Unshipped',
      purchase_date: json.purchaseDate || new Date().toISOString(),
      marketplace_id: json.marketplaceId || 'ATVPDKIKX0DER',
      customer_email: json.buyer?.email || null,
      customer_name: json.buyer?.name || shippingAddress?.name || null,
      shipping_address: shippingAddress,
      character_specs: characterSpecs,
      dedication_text: characterSpecs.dedication || null,
      product_info: json.items || json._raw?.items || [],
      status: 'pending_w0',
      execution_status: 'pending_w0', // W0 will update to 'ready_for_processing'
      next_workflow: null, // W0 will set to '2A'
      updated_at: new Date().toISOString(),
    };

    // Ensure created_at is set (for new orders)
    const now = new Date().toISOString();
    if (!orderData.created_at) {
      orderData.created_at = now;
    }

    // Upsert to Supabase (idempotent via amazon_order_id unique constraint)
    const { supabase } = await import('@/lib/supabase-client');

    const { data: result, error } = await supabase
      .from('orders')
      .upsert(orderData, {
        onConflict: 'amazon_order_id',
        ignoreDuplicates: false, // Update if exists (idempotent)
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/amazon/orders] Supabase upsert error:', error);
      throw new Error(`Failed to store order in Supabase: ${error.message}`);
    }

    const isNewOrder = result?.created_at === result?.updated_at;
    console.log(`[POST /api/amazon/orders] ${isNewOrder ? '✅ Created' : '✅ Updated'} order ${orderIdValue} (idempotent)`);

    return NextResponse.json({
      success: true,
      orderId: orderIdValue,
      amazonOrderId: orderIdValue,
      characterHash,
      isNewOrder,
      message: isNewOrder ? 'Order created' : 'Order updated (idempotent)',
      storedAt: new Date().toISOString(),
      executionStatus: orderData.execution_status,
      nextWorkflow: orderData.next_workflow,
    }, { status: isNewOrder ? 201 : 200 });

  } catch (error: any) {
    console.error('[POST /api/amazon/orders] Error storing order:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to store order',
    }, { status: error?.status || 500 });
  }
}

export const POST = withErrorHandling(postAmazonOrder);

