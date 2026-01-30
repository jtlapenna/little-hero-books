import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import {
  validateCsvHeaders,
  extractAmazonOrderId,
  buildLineItemFromRow,
  buildShippingAddress,
  extractCustomerName,
  extractCustomerEmail,
  extractCustomizationUrl,
  extractPurchaseDate,
} from '@/lib/csv-upload-helpers';
import { updateOrderInSupabase, getOrderFromSupabase } from '@/lib/supabase-client';
import { downloadAndExtractCustomizationZip } from '@/lib/zip-downloader';
import { parseAmazonCustomization } from '@/lib/amazon-customization-parser';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const n8nW0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/admin/amazon-orders/upload-csv
 * 
 * Uploads and processes CSV file from Amazon Seller Central to populate customer data.
 * 
 * Request: multipart/form-data with 'file' field containing CSV file
 * 
 * Returns: Summary of processing results
 */
export async function POST(request: NextRequest) {
  const requestId = `csv-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[CSV Upload] [${requestId}] ====== CSV Upload Request Started ======`);
  console.log(`[CSV Upload] [${requestId}] Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Allow same-origin requests (internal admin page) without auth
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const isSameOrigin =
      origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
      referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
      !origin;

    console.log(`[CSV Upload] [${requestId}] Origin check: origin=${origin}, referer=${referer}, isSameOrigin=${isSameOrigin}`);

    if (!isSameOrigin) {
      console.error(`[CSV Upload] [${requestId}] ❌ Unauthorized - origin check failed`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error(`[CSV Upload] [${requestId}] ❌ Supabase credentials missing`);
      return NextResponse.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 }
      );
    }

    console.log(`[CSV Upload] [${requestId}] ✅ Auth and config checks passed`);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse form data
    console.log(`[CSV Upload] [${requestId}] Parsing form data...`);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    console.log(`[CSV Upload] [${requestId}] File received: ${file ? `name=${file.name}, size=${file.size} bytes` : 'null'}`);

    if (!file) {
      console.error(`[CSV Upload] [${requestId}] ❌ No file provided`);
      return NextResponse.json(
        { error: 'No file provided. Please upload a CSV file.' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    console.log(`[CSV Upload] [${requestId}] Validating file: ${fileName}`);
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
      console.error(`[CSV Upload] [${requestId}] ❌ Invalid file type: ${fileName}`);
      return NextResponse.json(
        { error: 'Invalid file type. Only .csv and .txt files are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.error(`[CSV Upload] [${requestId}] ❌ File too large: ${file.size} bytes`);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    // Read file as text
    console.log(`[CSV Upload] [${requestId}] Reading file content...`);
    const fileText = await file.text();
    console.log(`[CSV Upload] [${requestId}] File content length: ${fileText.length} characters`);

    // Detect delimiter (tab-separated or comma-separated)
    // Check first line for tabs
    const firstLine = fileText.split('\n')[0];
    const isTabSeparated = firstLine.includes('\t');
    const delimiter = isTabSeparated ? '\t' : ',';
    console.log(`[CSV Upload] [${requestId}] Detected delimiter: ${isTabSeparated ? 'TAB' : 'COMMA'}`);

    // Parse CSV/TSV
    console.log(`[CSV Upload] [${requestId}] Parsing CSV/TSV...`);
    const parseResult = Papa.parse<string[]>(fileText, {
      header: false,
      skipEmptyLines: true,
      delimiter: delimiter,
      transformHeader: (header) => header.trim(),
    });
    console.log(`[CSV Upload] [${requestId}] Parse result: ${parseResult.data.length} rows, ${parseResult.errors.length} errors`);

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'CSV parsing errors',
          details: parseResult.errors.map((e) => ({
            row: e.row,
            message: e.message,
            type: e.type,
          })),
        },
        { status: 400 }
      );
    }

    const rows = parseResult.data;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty or contains no data rows.' },
        { status: 400 }
      );
    }

    // First row should be headers
    const headers = rows[0].map((h) => String(h).trim());
    if (headers.length === 0) {
      return NextResponse.json(
        { error: 'CSV file has no headers.' },
        { status: 400 }
      );
    }

    // Validate required columns
    const headerValidation = validateCsvHeaders(headers);
    if (!headerValidation.valid) {
      return NextResponse.json(
        {
          error: 'Missing required columns',
          missing: headerValidation.missing,
          availableColumns: headers,
        },
        { status: 400 }
      );
    }

    // Process rows (skip header row): group by order-id so one order with multiple line items is created/updated once
    const dataRows = rows.slice(1);
    const summary = {
      total_rows: dataRows.length,
      total_orders: 0, // Unique orders (after grouping)
      matched: 0,
      created: 0,
      pending: 0,
      errors: 0,
    };

    const matchedOrders: string[] = [];
    const createdOrders: string[] = [];
    const pendingOrders: string[] = [];
    const errors: Array<{ row: number; orderId: string | null; error: string }> = [];
    const w0Triggered: string[] = [];
    const w0Skipped: Array<{ orderId: string; reason: string }> = [];

    // Group rows by order-id (same order can have multiple line items / rows)
    const orderIdToRows = new Map<string, { row: any; rowNumber: number }[]>();
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;
      const amazonOrderId = extractAmazonOrderId(row, headers);
      if (!amazonOrderId) {
        errors.push({ row: rowNumber, orderId: null, error: 'Missing or invalid amazon_order_id' });
        summary.errors++;
        continue;
      }
      const shippingAddress = buildShippingAddress(row, headers);
      if (!shippingAddress) {
        errors.push({ row: rowNumber, orderId: amazonOrderId, error: 'Missing required shipping address fields' });
        summary.errors++;
        continue;
      }
      if (!orderIdToRows.has(amazonOrderId)) {
        orderIdToRows.set(amazonOrderId, []);
      }
      orderIdToRows.get(amazonOrderId)!.push({ row, rowNumber });
    }

    summary.total_orders = orderIdToRows.size;
    console.log(`[CSV Upload] [${requestId}] Grouped ${dataRows.length} rows into ${orderIdToRows.size} unique order(s)`);

    for (const [amazonOrderId, group] of orderIdToRows) {
      const firstRow = group[0].row;
      const firstRowNumber = group[0].rowNumber;

      try {
        const shippingAddress = buildShippingAddress(firstRow, headers)!;
        const customerName = extractCustomerName(firstRow, headers);
        const customerEmail = extractCustomerEmail(firstRow, headers);
        const purchaseDate = extractPurchaseDate(firstRow, headers);

        // Build line_items from every row in this order (multiple items per order)
        const lineItems = group.map(({ row }) => buildLineItemFromRow(row, headers));
        console.log(`[CSV Upload] [${requestId}] Order ${amazonOrderId}: ${lineItems.length} line item(s)`);

        // Use first row that has a customization URL for order-level character_specs
        let characterSpecs: Record<string, unknown> | null = null;
        for (const { row } of group) {
          const customizationUrl = extractCustomizationUrl(row, headers);
          if (customizationUrl) {
            try {
              const customizationData = await downloadAndExtractCustomizationZip(customizationUrl);
              if (customizationData) {
                characterSpecs = parseAmazonCustomization(customizationData);
                if (characterSpecs) break;
              }
            } catch (e) {
              // try next row
            }
          }
        }

        const { data: orderCheck, error: queryError } = await supabase
          .from('orders')
          .select('amazon_order_id')
          .eq('amazon_order_id', amazonOrderId)
          .single();

        const orderExists = !queryError && orderCheck;

        if (!orderExists) {
          let characterHash: string | null = null;
          if (characterSpecs) {
            const characterHashSpec = {
              clothingStyle: characterSpecs.clothingStyle || 't-shirt and shorts',
              favoriteColor: characterSpecs.favoriteColor || 'blue',
              hairColor: characterSpecs.hairColor || 'brown',
              hairStyle: characterSpecs.hairStyle || 'short/straight',
              skinTone: characterSpecs.skinTone || 'medium'
            };
            characterHash = createHash('sha256').update(JSON.stringify(characterHashSpec)).digest('hex').substring(0, 16);
          }

          const newOrderData: Record<string, unknown> = {
            orderId: amazonOrderId,
            amazon_order_id: amazonOrderId,
            shipping_address: shippingAddress,
            customer_name: customerName || null,
            customer_email: customerEmail || null,
            character_specs: characterSpecs || null,
            character_hash: characterHash,
            dedication_text: characterSpecs?.dedication || null,
            status: 'new',
            execution_status: 'pending_w0',
            next_workflow: null,
            workflow_step: null,
            marketplace_id: 'ATVPDKIKX0DER',
            purchase_date: purchaseDate || new Date().toISOString(),
            product_info: { _created_via_csv: true, line_items: lineItems },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { error: createError } = await supabase
            .from('orders')
            .insert(newOrderData)
            .select()
            .single();

          if (createError) {
            errors.push({ row: firstRowNumber, orderId: amazonOrderId, error: `Failed to create order: ${createError.message}` });
            summary.errors++;
            continue;
          }
          console.log(`[CSV Upload] [${requestId}] ✅ Created order ${amazonOrderId} with ${lineItems.length} line item(s)`);
          createdOrders.push(amazonOrderId);
          summary.created++;
        } else {
          const existingOrderFull = await getOrderFromSupabase(amazonOrderId).catch(() => null);
          const updates: Record<string, unknown> = {
            shipping_address: shippingAddress,
            customer_name: customerName ?? undefined,
            customer_email: customerEmail ?? undefined,
            product_info: { _created_via_csv: true, line_items: lineItems },
            updated_at: new Date().toISOString(),
          };
          if (characterSpecs) {
            updates.character_specs = characterSpecs;
            updates.character_hash = createHash('sha256').update(JSON.stringify({
              clothingStyle: characterSpecs.clothingStyle || 't-shirt and shorts',
              favoriteColor: characterSpecs.favoriteColor || 'blue',
              hairColor: characterSpecs.hairColor || 'brown',
              hairStyle: characterSpecs.hairStyle || 'short/straight',
              skinTone: characterSpecs.skinTone || 'medium'
            })).digest('hex').substring(0, 16);
          }
          if (existingOrderFull?.review_stages) {
            updates.review_stages = existingOrderFull.review_stages;
          }
          try {
            await updateOrderInSupabase(amazonOrderId, updates);
            matchedOrders.push(amazonOrderId);
            summary.matched++;
          } catch (updateException: unknown) {
            const msg = updateException instanceof Error ? updateException.message : String(updateException);
            errors.push({ row: firstRowNumber, orderId: amazonOrderId, error: `Exception updating order: ${msg}` });
            summary.errors++;
            continue;
          }
        }

        // W0 trigger (once per order)
        try {
          const { data: updatedOrder, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('amazon_order_id', amazonOrderId)
            .single();

          if (fetchError || !updatedOrder) {
            w0Skipped.push({ orderId: amazonOrderId, reason: fetchError?.message || 'Failed to fetch order' });
            continue;
          }

          let shippingAddressObj = updatedOrder.shipping_address;
          if (typeof shippingAddressObj === 'string') {
            try { shippingAddressObj = JSON.parse(shippingAddressObj); } catch { shippingAddressObj = null; }
          }
          let characterSpecsObj = updatedOrder.character_specs;
          if (typeof characterSpecsObj === 'string') {
            try { characterSpecsObj = JSON.parse(characterSpecsObj); } catch { characterSpecsObj = null; }
          }

          const hasShipping = shippingAddressObj && typeof shippingAddressObj === 'object' && !Array.isArray(shippingAddressObj) && Object.keys(shippingAddressObj).length > 0;
          const hasCharacterSpecs = characterSpecsObj && typeof characterSpecsObj === 'object' && !Array.isArray(characterSpecsObj) && Object.keys(characterSpecsObj).length > 0;

          if (hasShipping && hasCharacterSpecs && n8nW0WebhookUrl) {
            let characterHash = updatedOrder.character_hash;
            if (!characterHash && characterSpecsObj) {
              const orderIdValue = updatedOrder.orderId || updatedOrder.amazon_order_id;
              const sortedSpecs = Object.keys(characterSpecsObj as object).sort().reduce((acc: Record<string, unknown>, key: string) => {
                acc[key] = (characterSpecsObj as Record<string, unknown>)[key];
                return acc;
              }, {});
              characterHash = createHash('md5').update(JSON.stringify({ ...sortedSpecs, orderId: orderIdValue })).digest('hex').substring(0, 16);
              await supabase.from('orders').update({ character_hash: characterHash }).eq('amazon_order_id', amazonOrderId);
            }

            const productInfo = updatedOrder.product_info as Record<string, unknown> | undefined;
            const items = (productInfo?.line_items as unknown[]) ?? (Array.isArray(productInfo) ? productInfo : []);

            const w0Payload = {
              amazonOrderId: updatedOrder.amazon_order_id || amazonOrderId,
              orderId: updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId,
              id: updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId,
              orderDate: updatedOrder.purchase_date,
              purchaseDate: updatedOrder.purchase_date,
              status: 'pending_w0',
              marketplaceId: updatedOrder.marketplace_id,
              customerEmail: updatedOrder.customer_email,
              buyer: { email: updatedOrder.customer_email, name: updatedOrder.customer_name },
              shippingAddress: shippingAddressObj,
              characterSpecs: characterSpecsObj,
              character_specs: characterSpecsObj,
              CharacterSpecs: characterSpecsObj,
              bookSpecs: {
                title: `${(characterSpecsObj && typeof characterSpecsObj === 'object' && (characterSpecsObj as Record<string, unknown>)?.childName) || 'Child'} and the Adventure Compass`,
                totalPages: 16,
                format: '8.5x8.5_softcover',
                bookType: 'adventure',
              },
              orderDetails: { quantity: lineItems.length, shippingAddress: shippingAddressObj },
              dedication: (characterSpecsObj as Record<string, unknown>)?.dedication || updatedOrder.dedication_text || null,
              Dedication: (characterSpecsObj as Record<string, unknown>)?.dedication || updatedOrder.dedication_text || null,
              items,
              characterHash: characterHash ?? updatedOrder.character_hash,
              character_hash: characterHash ?? updatedOrder.character_hash,
            };

            const w0Response = await fetch(n8nW0WebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w0Payload) });
            const responseText = await w0Response.text();
            if (w0Response.ok) {
              w0Triggered.push(amazonOrderId);
            } else {
              w0Skipped.push({ orderId: amazonOrderId, reason: `W0 webhook failed: ${w0Response.status} ${responseText.substring(0, 200)}` });
            }
          } else {
            const reason = !hasShipping ? 'missing shipping_address' : !hasCharacterSpecs ? 'missing character_specs' : !n8nW0WebhookUrl ? 'N8N_W0_WEBHOOK_URL not configured' : 'unknown';
            w0Skipped.push({ orderId: amazonOrderId, reason });
          }
        } catch (w0Error: unknown) {
          const msg = w0Error instanceof Error ? w0Error.message : String(w0Error);
          w0Skipped.push({ orderId: amazonOrderId, reason: `Exception: ${msg}` });
        }
      } catch (orderError: unknown) {
        const msg = orderError instanceof Error ? orderError.message : String(orderError);
        errors.push({ row: firstRowNumber, orderId: amazonOrderId, error: `Order processing error: ${msg}` });
        summary.errors++;
      }
    }

    // Return summary
    const response = {
      success: true,
      summary,
      details: {
        matched_orders: matchedOrders, // Orders that existed and were updated
        created_orders: createdOrders, // Orders that were created from CSV
        pending_orders: pendingOrders,
        errors: errors,
        w0_triggered: w0Triggered, // Orders that had W0 automatically triggered
        w0_skipped: w0Skipped, // Orders where W0 was skipped and why
      },
      timestamp: new Date().toISOString(),
      request_id: requestId, // Include request ID for log correlation
    };
    
    console.log(`[CSV Upload] [${requestId}] ====== Request Completed Successfully ======`);
    console.log(`[CSV Upload] [${requestId}] Summary: ${summary.total_orders} unique order(s), ${summary.matched} matched, ${summary.created} created, ${summary.pending} pending, ${summary.errors} errors`);
    console.log(`[CSV Upload] [${requestId}] W0 triggered for: ${w0Triggered.length} orders`);
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[CSV Upload] [${requestId}] ====== ERROR ======`);
    console.error(`[CSV Upload] [${requestId}] Error message:`, error?.message || 'Unknown error');
    console.error(`[CSV Upload] [${requestId}] Error stack:`, error?.stack);
    console.error(`[CSV Upload] [${requestId}] Full error:`, JSON.stringify(error, null, 2));
    return NextResponse.json(
      {
        error: 'Failed to process CSV file',
        details: error?.message || 'Unknown error',
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}

