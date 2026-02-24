import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import Papa from 'papaparse';
import {
  validateCsvHeaders,
  extractAmazonOrderId,
  extractOrderItemId,
  buildShippingAddress,
  extractCustomerName,
  extractCustomerEmail,
  extractCustomizationUrl,
  extractPurchaseDate,
} from '@/lib/csv-upload-helpers';
import { updateOrderInSupabase, getOrderFromSupabase } from '@/lib/supabase-client';
import { downloadAndExtractCustomizationZip } from '@/lib/zip-downloader';
import { parseAmazonCustomization } from '@/lib/amazon-customization-parser';
import {
  calculateSiblingCharacterHash,
  buildSiblingOrderRow,
  buildW0Payload,
  triggerW0,
} from '@/lib/sibling-order-helpers';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

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
    // Purpose: fail-closed admin auth (strict same-origin OR Bearer BACKEND_API_TOKEN).
    const adminAuth = requireAdminAuth(request);
    if (!adminAuth.ok) {
      console.error(`[CSV Upload] [${requestId}] ❌ Unauthorized`);
      return adminAuth.response;
    }
    console.log(`[CSV Upload] [${requestId}] ✅ Admin auth accepted via ${adminAuth.mode}`);

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

    // Process rows: group by amazon-order-id, then create ONE order per row
    // (primary for first row, sibling for subsequent rows in same group)
    const dataRows = rows.slice(1);
    const summary = {
      total_rows: dataRows.length,
      total_orders: 0,
      matched: 0,
      created: 0,
      sibling_created: 0,
      pending: 0,
      errors: 0,
    };

    const matchedOrders: string[] = [];
    const createdOrders: string[] = [];
    const siblingOrdersCreated: string[] = [];
    const pendingOrders: string[] = [];
    const errors: Array<{ row: number; orderId: string | null; error: string }> = [];
    const w0Triggered: string[] = [];
    const w0Skipped: Array<{ orderId: string; reason: string }> = [];

    // Group rows by order-id to extract shared shipping/customer data
    const orderIdToRows = new Map<string, { row: unknown; rowNumber: number }[]>();
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;
      const amazonOrderId = extractAmazonOrderId(row as string[], headers);
      if (!amazonOrderId) {
        errors.push({ row: rowNumber, orderId: null, error: 'Missing or invalid amazon_order_id' });
        summary.errors++;
        continue;
      }
      const shippingAddress = buildShippingAddress(row as string[], headers);
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
      const shippingAddress = buildShippingAddress(firstRow, headers)!;
      const customerName = extractCustomerName(firstRow, headers);
      const customerEmail = extractCustomerEmail(firstRow, headers);
      const purchaseDate = extractPurchaseDate(firstRow, headers);

      // Download customization per row (each row may be a different child)
      const rowSpecs: Array<{
        rowNumber: number;
        orderItemId: string | null;
        customizationUrl: string | null;
        customizedUrlHash: string | null;
        characterSpecs: Record<string, unknown> | null;
        customizationFailure: string | null;
      }> = [];

      for (const { row, rowNumber } of group) {
        const orderItemId = extractOrderItemId(row as string[], headers);
        const customizationUrl = extractCustomizationUrl(row as string[], headers);
        const stableCustomizationKey = customizationUrl
          ? (() => {
              // Purpose: ignore query params that may rotate between downloads.
              try {
                const u = new URL(customizationUrl);
                return `${u.origin}${u.pathname}`;
              } catch {
                return customizationUrl;
              }
            })()
          : null;
        const customizedUrlHash = stableCustomizationKey
          ? createHash('sha256').update(stableCustomizationKey).digest('hex').slice(0, 12)
          : null;
        let specs: Record<string, unknown> | null = null;
        let failure: string | null = null;

        if (customizationUrl) {
          try {
            const zipData = await downloadAndExtractCustomizationZip(customizationUrl);
            if (zipData) {
              specs = parseAmazonCustomization(zipData);
              if (!specs) failure = 'Parse failed: customization format not recognized';
            } else {
              failure = 'Download returned no data';
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            failure = `Download/extract failed: ${msg}`;
            console.warn(`[CSV Upload] [${requestId}] Customization row ${rowNumber}: ${msg}`);
          }
        } else {
          failure = 'No customization URL in this row';
        }
        rowSpecs.push({
          rowNumber,
          orderItemId,
          customizationUrl: customizationUrl ?? null,
          customizedUrlHash,
          characterSpecs: specs,
          customizationFailure: failure,
        });
      }

      // Process each row as its own order
      for (let idx = 0; idx < rowSpecs.length; idx++) {
        const { rowNumber, orderItemId, characterSpecs, customizationFailure, customizedUrlHash } = rowSpecs[idx];
        const isSibling = idx > 0;
        // Purpose: deterministic per-book orderId, even when order-item-id is missing.
        const suffix = (orderItemId?.trim() || customizedUrlHash || String(idx + 1)).trim();
        const effectiveOrderId = isSibling ? `${amazonOrderId}-item-${suffix}` : amazonOrderId;

        try {
          // Purpose: existence check by per-book identity (orderId), not amazon_order_id.
          const existing = await getOrderFromSupabase(effectiveOrderId).catch(() => null);
          if (existing) {
            const existingRecord = existing as Record<string, unknown>;
            // Update existing order with latest shipping/specs
            const updates: Record<string, unknown> = {
              shipping_address: shippingAddress,
              customer_name: customerName ?? undefined,
              customer_email: customerEmail ?? undefined,
              root_order_id: amazonOrderId,
              amazon_order_id: amazonOrderId,
              updated_at: new Date().toISOString(),
            };
            if (characterSpecs) {
              updates.character_specs = characterSpecs;
              updates.character_hash = calculateSiblingCharacterHash(characterSpecs);
            }
            if (existingRecord.review_stages) updates.review_stages = existingRecord.review_stages;
            updates.product_info = {
              ...(((existingRecord.product_info as Record<string, unknown> | null) ?? {})),
              _created_via_csv: true,
              _csv_sibling_index: idx,
              _customized_url_hash: customizedUrlHash,
              ...(isSibling ? { _sibling_order: true, _parent_amazon_order_id: amazonOrderId, _order_item_id: orderItemId ?? null } : {}),
            };

            try {
              await updateOrderInSupabase(effectiveOrderId, updates);
              matchedOrders.push(effectiveOrderId);
              summary.matched++;
            } catch (ue: unknown) {
              const msg = ue instanceof Error ? ue.message : String(ue);
              errors.push({ row: rowNumber, orderId: effectiveOrderId, error: `Update failed: ${msg}` });
              summary.errors++;
              continue;
            }
          } else {
            // Create new order row
            if (!characterSpecs) {
              errors.push({
                row: rowNumber,
                orderId: effectiveOrderId,
                error: customizationFailure ?? 'No character_specs available for this row',
              });
              summary.errors++;
              continue;
            }

            const characterHash = calculateSiblingCharacterHash(characterSpecs);
            const orderRow = buildSiblingOrderRow({
              orderId: effectiveOrderId,
              parentOrderId: amazonOrderId,
              platform: 'amazon',
              shippingAddress,
              customerName: customerName || null,
              customerEmail: customerEmail || null,
              characterSpecs,
              characterHash,
              marketplaceId: 'ATVPDKIKX0DER',
              purchaseDate,
              orderItemId,
              isSibling,
            });
            // Purpose: stable debug keys for re-upload + recovery.
            const orderRowRecord = orderRow as Record<string, unknown>;
            orderRowRecord.product_info = {
              ...(((orderRowRecord.product_info as Record<string, unknown> | null) ?? {})),
              _csv_sibling_index: idx,
              _customized_url_hash: customizedUrlHash,
            };

            const { error: insertError } = await supabase
              .from('orders')
              .insert(orderRow)
              .select()
              .single();

            if (insertError) {
              const insertMsg = String(insertError.message || '');
              if (insertMsg.includes('orders_amazon_order_id_key')) {
                errors.push({
                  row: rowNumber,
                  orderId: effectiveOrderId,
                  error:
                    'DB constraint blocks sibling groups: orders.amazon_order_id is unique. Remove/relax this constraint to allow multiple siblings under one Amazon root.',
                });
                summary.errors++;
                continue;
              }
              errors.push({ row: rowNumber, orderId: effectiveOrderId, error: `Insert failed: ${insertError.message}` });
              summary.errors++;
              continue;
            }

            if (isSibling) {
              siblingOrdersCreated.push(effectiveOrderId);
              summary.sibling_created++;
            }
            createdOrders.push(effectiveOrderId);
            summary.created++;
            console.log(`[CSV Upload] [${requestId}] ✅ Created ${isSibling ? 'sibling' : 'primary'} order ${effectiveOrderId}`);
          }

          // Trigger W0 for this order
          if (!characterSpecs && !existing) continue; // already errored above

          const specsForW0 = characterSpecs ?? (await (async () => {
            const q1 = await supabase.from('orders').select('character_specs').eq('orderId', effectiveOrderId).maybeSingle();
            if (q1.error?.code !== '42703' && q1.error) throw q1.error;
            const q2 = q1.error?.code === '42703'
              ? await supabase.from('orders').select('character_specs').eq('order_id', effectiveOrderId).maybeSingle()
              : null;
            if (q2?.error) throw q2.error;
            const s = (q2?.data ?? q1.data)?.character_specs;
            return (s && typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length > 0)
              ? (s as Record<string, unknown>)
              : null;
          })());

          if (!specsForW0) {
            w0Skipped.push({ orderId: effectiveOrderId, reason: customizationFailure ?? 'missing character_specs' });
            continue;
          }

          const charHash = calculateSiblingCharacterHash(specsForW0);
          const payload = buildW0Payload({
            orderId: effectiveOrderId,
            amazonOrderId,
            purchaseDate,
            marketplaceId: 'ATVPDKIKX0DER',
            customerEmail,
            customerName,
            shippingAddress,
            characterSpecs: specsForW0,
            characterHash: charHash,
          });

          const w0Result = await triggerW0(payload);
          if (w0Result.ok) {
            w0Triggered.push(effectiveOrderId);
          } else {
            w0Skipped.push({ orderId: effectiveOrderId, reason: w0Result.error ?? 'unknown' });
          }
        } catch (orderError: unknown) {
          const msg = orderError instanceof Error ? orderError.message : String(orderError);
          errors.push({ row: rowNumber, orderId: effectiveOrderId, error: `Processing error: ${msg}` });
          summary.errors++;
        }
      }
    }

    const response = {
      success: true,
      summary,
      details: {
        matched_orders: matchedOrders,
        created_orders: createdOrders,
        sibling_orders_created: siblingOrdersCreated,
        pending_orders: pendingOrders,
        errors,
        w0_triggered: w0Triggered,
        w0_skipped: w0Skipped,
      },
      timestamp: new Date().toISOString(),
      request_id: requestId,
    };
    
    console.log(`[CSV Upload] [${requestId}] ====== Request Completed Successfully ======`);
    console.log(`[CSV Upload] [${requestId}] Summary: ${summary.total_orders} group(s), ${summary.created} created (${summary.sibling_created} siblings), ${summary.matched} matched, ${summary.errors} errors`);
    console.log(`[CSV Upload] [${requestId}] W0 triggered for: ${w0Triggered.length} order(s)`);
    
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error(`[CSV Upload] [${requestId}] ====== ERROR ======`);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CSV Upload] [${requestId}] Error message:`, message);
    if (error instanceof Error) console.error(`[CSV Upload] [${requestId}] Error stack:`, error.stack);
    return NextResponse.json(
      {
        error: 'Failed to process CSV file',
        details: message,
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}

