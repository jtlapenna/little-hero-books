import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import {
  validateCsvHeaders,
  extractAmazonOrderId,
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

    // Process rows (skip header row)
    const dataRows = rows.slice(1);
    const summary = {
      total_rows: dataRows.length,
      matched: 0, // Orders that existed and were updated
      created: 0, // Orders that were created from CSV
      pending: 0,
      errors: 0,
    };

    const matchedOrders: string[] = []; // Orders that existed and were updated
    const createdOrders: string[] = []; // Orders that were created from CSV
    const pendingOrders: string[] = [];
    const errors: Array<{ row: number; orderId: string | null; error: string }> = [];
    const w0Triggered: string[] = []; // Track orders that had W0 triggered
    const w0Skipped: Array<{ orderId: string; reason: string }> = []; // Track orders where W0 was skipped and why

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2; // +2 because we skip header and are 0-indexed

      try {
        // Extract amazon_order_id
        const amazonOrderId = extractAmazonOrderId(row, headers);
        console.log(`[CSV Upload] [${requestId}] Row ${rowNumber}: Extracted amazonOrderId="${amazonOrderId}"`);
        if (!amazonOrderId) {
          console.error(`[CSV Upload] [${requestId}] Row ${rowNumber}: ❌ Failed to extract amazonOrderId`);
          console.error(`[CSV Upload] [${requestId}] Row ${rowNumber}: Headers:`, headers);
          console.error(`[CSV Upload] [${requestId}] Row ${rowNumber}: Row data:`, row);
          errors.push({
            row: rowNumber,
            orderId: null,
            error: 'Missing or invalid amazon_order_id',
          });
          summary.errors++;
          continue;
        }

        // Build shipping address (required for order creation)
        const shippingAddress = buildShippingAddress(row, headers);
        if (!shippingAddress) {
          errors.push({
            row: rowNumber,
            orderId: amazonOrderId,
            error: 'Missing required shipping address fields',
          });
          summary.errors++;
          continue;
        }

        // Extract customer data
        const customerName = extractCustomerName(row, headers);
        const customerEmail = extractCustomerEmail(row, headers);
        const purchaseDate = extractPurchaseDate(row, headers);

        // Extract customization URL if available
        const customizationUrl = extractCustomizationUrl(row, headers);
        let characterSpecs = null;

        console.log(`[CSV Upload] [${requestId}] Order ${amazonOrderId}: customizationUrl=${customizationUrl || 'null'}`);

        // Download and parse customization ZIP if URL is present
        if (customizationUrl) {
          console.log(`[CSV Upload] [${requestId}] Downloading customization ZIP from: ${customizationUrl}`);
          try {
            const customizationData = await downloadAndExtractCustomizationZip(customizationUrl);
            if (customizationData) {
              console.log(`[CSV Upload] [${requestId}] ✅ Customization ZIP downloaded, parsing JSON...`);
              characterSpecs = parseAmazonCustomization(customizationData);
              if (characterSpecs) {
                console.log(`[CSV Upload] [${requestId}] ✅ Customization parsed successfully:`, JSON.stringify(characterSpecs, null, 2));
              } else {
                console.warn(`[CSV Upload] [${requestId}] ⚠️ Failed to parse customization for order ${amazonOrderId}`);
                console.warn(`[CSV Upload] [${requestId}] Customization data structure:`, JSON.stringify(customizationData, null, 2).substring(0, 1000));
              }
            } else {
              console.warn(`[CSV Upload] [${requestId}] ⚠️ Customization ZIP download returned null for order ${amazonOrderId}`);
            }
          } catch (customizationError: any) {
            console.error(`[CSV Upload] [${requestId}] ❌ Error processing customization for order ${amazonOrderId}:`, customizationError.message);
            console.error(`[CSV Upload] [${requestId}] Customization error stack:`, customizationError.stack);
            // Continue processing even if customization fails
          }
        } else {
          console.log(`[CSV Upload] [${requestId}] ⚠️ No customization URL found in CSV for order ${amazonOrderId}`);
        }

        // Query Supabase for order
        console.log(`[CSV Upload] [${requestId}] Row ${rowNumber}: Querying Supabase for order with amazon_order_id="${amazonOrderId}"`);
        const { data: orderCheck, error: queryError } = await supabase
          .from('orders')
          .select('amazon_order_id')
          .eq('amazon_order_id', amazonOrderId)
          .single();

        const orderExists = !queryError && orderCheck;

        if (!orderExists) {
          // Order not found - create it with CSV data
          console.log(`[CSV Upload] [${requestId}] Order ${amazonOrderId} not found - creating new order from CSV data`);
          
          // Calculate character hash if we have character specs
          let characterHash = null;
          if (characterSpecs) {
            const characterHashSpec = {
              clothingStyle: characterSpecs.clothingStyle || 't-shirt and shorts',
              favoriteColor: characterSpecs.favoriteColor || 'blue',
              hairColor: characterSpecs.hairColor || 'brown',
              hairStyle: characterSpecs.hairStyle || 'short/straight',
              skinTone: characterSpecs.skinTone || 'medium'
            };
            const hashString = JSON.stringify(characterHashSpec);
            characterHash = createHash('sha256').update(hashString).digest('hex').substring(0, 16);
          }

          // Build new order data
          const newOrderData: any = {
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
            marketplace_id: 'ATVPDKIKX0DER', // Default to US marketplace
            purchase_date: purchaseDate || new Date().toISOString(), // Use CSV date if available, otherwise current date
            product_info: { _created_via_csv: true },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          try {
            const { data: createdOrder, error: createError } = await supabase
              .from('orders')
              .insert(newOrderData)
              .select()
              .single();

            if (createError) {
              console.error(`[CSV Upload] [${requestId}] ❌ Failed to create order ${amazonOrderId}:`, createError.message);
              errors.push({
                row: rowNumber,
                orderId: amazonOrderId,
                error: `Failed to create order: ${createError.message}`,
              });
              summary.errors++;
              continue;
            }

            console.log(`[CSV Upload] [${requestId}] ✅ Created new order ${amazonOrderId} from CSV`);
            createdOrders.push(amazonOrderId);
            summary.created++;
          } catch (createException: any) {
            console.error(`[CSV Upload] [${requestId}] ❌ Exception creating order ${amazonOrderId}:`, createException.message);
            errors.push({
              row: rowNumber,
              orderId: amazonOrderId,
              error: `Exception creating order: ${createException.message}`,
            });
            summary.errors++;
            continue;
          }
        } else {
          // Order exists - update it with CSV data
          console.log(`[CSV Upload] [${requestId}] Order ${amazonOrderId} exists - updating with CSV data`);

        // Get existing order to preserve review_stages
        const existingOrderFull = await getOrderFromSupabase(amazonOrderId).catch(() => null);

        // Prepare updates
        const updates: any = {
          shipping_address: shippingAddress,
        };

        if (customerName) {
          updates.customer_name = customerName;
        }

        if (customerEmail) {
          updates.customer_email = customerEmail;
        }

        // Add character specs if customization was successfully parsed
        if (characterSpecs) {
          updates.character_specs = characterSpecs;
            // Recalculate character hash if character specs changed
            const characterHashSpec = {
              clothingStyle: characterSpecs.clothingStyle || 't-shirt and shorts',
              favoriteColor: characterSpecs.favoriteColor || 'blue',
              hairColor: characterSpecs.hairColor || 'brown',
              hairStyle: characterSpecs.hairStyle || 'short/straight',
              skinTone: characterSpecs.skinTone || 'medium'
            };
            const hashString = JSON.stringify(characterHashSpec);
            updates.character_hash = createHash('sha256').update(hashString).digest('hex').substring(0, 16);
        }

        // Preserve review_stages to avoid losing approval status
        if (existingOrderFull?.review_stages) {
          updates.review_stages = existingOrderFull.review_stages;
        }

        // Update order in Supabase
        // Use updateOrderInSupabase which handles amazon_order_id lookup
        try {
          console.log(`[CSV Upload] [${requestId}] Updating order ${amazonOrderId} with updates:`, JSON.stringify(Object.keys(updates)));
          await updateOrderInSupabase(amazonOrderId, updates);
          console.log(`[CSV Upload] [${requestId}] ✅ Order ${amazonOrderId} updated successfully`);
          matchedOrders.push(amazonOrderId);
          summary.matched++;
          } catch (updateException: any) {
            console.error(`[CSV Upload] [${requestId}] ❌ Exception updating order ${amazonOrderId}:`, updateException.message);
            errors.push({
              row: rowNumber,
              orderId: amazonOrderId,
              error: `Exception updating order: ${updateException.message}`,
            });
            summary.errors++;
            continue;
          }
        }

          // Auto-trigger W0 if order now has complete data (shipping + character specs)
        // This runs for both created and updated orders
          // W0 will process the order, build manifest, and set execution_status to 'ready_for_processing'
          // Check if order has both shipping_address and character_specs (either from this update or already in DB)
        console.log(`[CSV Upload] [${requestId}] ✅ Order ${amazonOrderId} processed, checking W0 trigger...`);
          try {
            console.log(`[CSV Upload] [${requestId}] Entering W0 trigger try block for order ${amazonOrderId}`);
            // Fetch the updated order to get all data for W0
            const { data: updatedOrder, error: fetchError } = await supabase
              .from('orders')
              .select('*')
              .eq('amazon_order_id', amazonOrderId)
              .single();

            if (!fetchError && updatedOrder) {
              // Check if order has complete data (shipping + character specs)
              // Handle both JSON strings and objects from Supabase
              let shippingAddressObj = updatedOrder.shipping_address;
              if (typeof shippingAddressObj === 'string') {
                try {
                  shippingAddressObj = JSON.parse(shippingAddressObj);
                } catch (e) {
                  shippingAddressObj = null;
                }
              }
              
              let characterSpecsObj = updatedOrder.character_specs;
              if (typeof characterSpecsObj === 'string') {
                try {
                  characterSpecsObj = JSON.parse(characterSpecsObj);
                } catch (e) {
                  characterSpecsObj = null;
                }
              }
              
              // Check if objects are valid (not null, not array, have keys)
              const hasShipping = shippingAddressObj && 
                typeof shippingAddressObj === 'object' && 
                !Array.isArray(shippingAddressObj) &&
                shippingAddressObj !== null &&
                Object.keys(shippingAddressObj).length > 0;
              
              const hasCharacterSpecs = characterSpecsObj && 
                typeof characterSpecsObj === 'object' && 
                !Array.isArray(characterSpecsObj) &&
                characterSpecsObj !== null &&
                Object.keys(characterSpecsObj).length > 0;

              console.log(`[CSV Upload] [${requestId}] Order ${amazonOrderId} data check: hasShipping=${hasShipping}, hasCharacterSpecs=${hasCharacterSpecs}, webhookUrl=${!!n8nW0WebhookUrl}`);
              console.log(`[CSV Upload] [${requestId}] shipping_address type: ${typeof updatedOrder.shipping_address}, character_specs type: ${typeof updatedOrder.character_specs}`);
              console.log(`[CSV Upload] [${requestId}] shippingAddressObj: ${shippingAddressObj ? `object with ${Object.keys(shippingAddressObj).length} keys` : 'null/undefined'}`);
              console.log(`[CSV Upload] [${requestId}] characterSpecsObj: ${characterSpecsObj ? `object with ${Object.keys(characterSpecsObj).length} keys` : 'null/undefined'}`);
              console.log(`[CSV Upload] [${requestId}] n8nW0WebhookUrl: ${n8nW0WebhookUrl || 'MISSING'}`);
              console.log(`[CSV Upload] [${requestId}] Condition check: hasShipping=${hasShipping} (${typeof hasShipping}), hasCharacterSpecs=${hasCharacterSpecs} (${typeof hasCharacterSpecs}), n8nW0WebhookUrl=${!!n8nW0WebhookUrl} (${typeof n8nW0WebhookUrl})`);
              console.log(`[CSV Upload] [${requestId}] Final condition result: ${hasShipping && hasCharacterSpecs && n8nW0WebhookUrl}`);
              
              // Log detailed state for debugging
              if (!hasShipping) {
                console.log(`[CSV Upload] [${requestId}] ⚠️ Order ${amazonOrderId} missing shipping_address`);
                console.log(`[CSV Upload] [${requestId}] shipping_address value:`, JSON.stringify(updatedOrder.shipping_address));
                console.log(`[CSV Upload] [${requestId}] shipping_address parsed:`, JSON.stringify(shippingAddressObj));
              }
              if (!hasCharacterSpecs) {
                console.log(`[CSV Upload] [${requestId}] ⚠️ Order ${amazonOrderId} missing character_specs`);
                console.log(`[CSV Upload] [${requestId}] character_specs value:`, JSON.stringify(updatedOrder.character_specs));
                console.log(`[CSV Upload] [${requestId}] character_specs parsed:`, JSON.stringify(characterSpecsObj));
              }
              if (!n8nW0WebhookUrl) {
                console.log(`[CSV Upload] [${requestId}] ⚠️ N8N_W0_WEBHOOK_URL not configured`);
              }

              if (hasShipping && hasCharacterSpecs && n8nW0WebhookUrl) {
                console.log(`[CSV Upload] [${requestId}] ✅ Conditions met - triggering W0 for order ${amazonOrderId}`);
                // Build W0 webhook payload (matches format from Amazon orders cron and /api/amazon/orders)
                // Use the already-parsed objects
                const characterSpecs = characterSpecsObj;
                const shippingAddress = shippingAddressObj;
                
                // Calculate character_hash if missing (same logic as Amazon orders cron)
                let characterHash = updatedOrder.character_hash;
                if (!characterHash && characterSpecs) {
                  const orderIdValue = updatedOrder.orderId || updatedOrder.amazon_order_id;
                  // Sort character specs keys for consistent hashing (matches cron logic)
                  const sortedSpecs = Object.keys(characterSpecs)
                    .sort()
                    .reduce((acc, key) => {
                      acc[key] = characterSpecs[key];
                      return acc;
                    }, {} as Record<string, any>);
                  const hashInput = JSON.stringify({ ...sortedSpecs, orderId: orderIdValue });
                  characterHash = createHash('md5').update(hashInput).digest('hex').substring(0, 16);
                  
                  // Save character_hash to Supabase if it was just calculated
                  console.log(`[CSV Upload] [${requestId}] Saving character_hash to Supabase: ${characterHash}`);
                  await supabase
                    .from('orders')
                    .update({ character_hash: characterHash })
                    .eq('amazon_order_id', amazonOrderId);
                }
                
                // Log the order IDs being used in W0 payload
                console.log(`[CSV Upload] [${requestId}] Building W0 payload for order ${amazonOrderId}`);
                console.log(`[CSV Upload] [${requestId}] updatedOrder.amazon_order_id: ${updatedOrder.amazon_order_id}`);
                console.log(`[CSV Upload] [${requestId}] updatedOrder.orderId: ${updatedOrder.orderId}`);
                console.log(`[CSV Upload] [${requestId}] Using amazonOrderId: ${updatedOrder.amazon_order_id || amazonOrderId}`);
                console.log(`[CSV Upload] [${requestId}] Using orderId: ${updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId}`);
                
                const w0Payload = {
                  amazonOrderId: updatedOrder.amazon_order_id || amazonOrderId,
                  orderId: updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId,
                  id: updatedOrder.orderId || updatedOrder.amazon_order_id || amazonOrderId,
                  orderDate: updatedOrder.purchase_date,
                  purchaseDate: updatedOrder.purchase_date,
                  status: 'pending_w0',
                  marketplaceId: updatedOrder.marketplace_id,
                  customerEmail: updatedOrder.customer_email,
                  buyer: {
                    email: updatedOrder.customer_email,
                    name: updatedOrder.customer_name,
                  },
                  shippingAddress: shippingAddress,
                  characterSpecs: characterSpecs,
                  character_specs: characterSpecs,
                  CharacterSpecs: characterSpecs,
                  bookSpecs: {
                    title: `${characterSpecs?.childName || 'Child'} and the Adventure Compass`,
                    totalPages: 16,
                    format: '8.5x8.5_softcover',
                    bookType: 'adventure',
                  },
                  orderDetails: {
                    quantity: 1,
                    shippingAddress: shippingAddress,
                  },
                  dedication: characterSpecs?.dedication || updatedOrder.dedication_text || null,
                  Dedication: characterSpecs?.dedication || updatedOrder.dedication_text || null,
                  items: Array.isArray(updatedOrder.product_info) ? updatedOrder.product_info : [],
                  characterHash: characterHash,
                  character_hash: characterHash,
                };

                const w0Response = await fetch(n8nW0WebhookUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(w0Payload),
                });

                const responseText = await w0Response.text();
                
                if (w0Response.ok) {
                  w0Triggered.push(amazonOrderId);
                  console.log(`[CSV Upload] [${requestId}] ✅ Successfully triggered W0 for order ${amazonOrderId}`);
                  console.log(`[CSV Upload] [${requestId}] W0 response status: ${w0Response.status}`);
                  if (responseText) {
                    try {
                      const responseJson = JSON.parse(responseText);
                      console.log(`[CSV Upload] [${requestId}] W0 response:`, JSON.stringify(responseJson, null, 2));
                    } catch (e) {
                      console.log(`[CSV Upload] [${requestId}] W0 response (text): ${responseText.substring(0, 500)}`);
                    }
                  }
                } else {
                  console.error(`[CSV Upload] [${requestId}] ❌ W0 webhook failed for order ${amazonOrderId}`);
                  console.error(`[CSV Upload] [${requestId}] Status: ${w0Response.status} ${w0Response.statusText}`);
                  console.error(`[CSV Upload] [${requestId}] Response: ${responseText.substring(0, 1000)}`);
                  w0Skipped.push({ orderId: amazonOrderId, reason: `W0 webhook failed: ${w0Response.status} ${w0Response.statusText}` });
                  // Don't fail the CSV upload if W0 fails - order is still updated
                }
              } else {
                const reason = !hasShipping ? 'missing shipping_address' : 
                              !hasCharacterSpecs ? 'missing character_specs' : 
                              !n8nW0WebhookUrl ? 'N8N_W0_WEBHOOK_URL not configured' : 'unknown';
                console.log(`[CSV Upload] [${requestId}] ⚠️ Skipping W0 trigger for order ${amazonOrderId}: ${reason}`);
                w0Skipped.push({ orderId: amazonOrderId, reason });
              }
            } else {
              console.error(`[CSV Upload] [${requestId}] ❌ Failed to fetch updated order ${amazonOrderId} for W0 trigger`);
              console.error(`[CSV Upload] [${requestId}] Error:`, fetchError?.message || 'Unknown error');
              console.error(`[CSV Upload] [${requestId}] Fetch error details:`, JSON.stringify(fetchError, null, 2));
              w0Skipped.push({ orderId: amazonOrderId, reason: `Failed to fetch order: ${fetchError?.message || 'Unknown error'}` });
            }
          } catch (w0Error: any) {
            console.error(`[CSV Upload] [${requestId}] ❌ Exception while triggering W0 for order ${amazonOrderId}:`);
            console.error(`[CSV Upload] [${requestId}] Error message: ${w0Error.message}`);
            console.error(`[CSV Upload] [${requestId}] Error stack:`, w0Error.stack);
            w0Skipped.push({ orderId: amazonOrderId, reason: `Exception: ${w0Error.message || 'Unknown error'}` });
            // Don't fail the CSV upload if W0 trigger fails - order is still updated
          }
          console.log(`[CSV Upload] [${requestId}] Exited W0 trigger try block for order ${amazonOrderId}`);
      } catch (rowError: any) {
        errors.push({
          row: rowNumber,
          orderId: null,
          error: `Row processing error: ${rowError?.message || 'Unknown error'}`,
        });
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
    console.log(`[CSV Upload] [${requestId}] Summary: ${summary.matched} matched, ${summary.created} created, ${summary.pending} pending, ${summary.errors} errors`);
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

