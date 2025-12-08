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
} from '@/lib/csv-upload-helpers';
import { updateOrderInSupabase } from '@/lib/supabase-client';
import { downloadAndExtractCustomizationZip } from '@/lib/zip-downloader';
import { parseAmazonCustomization } from '@/lib/amazon-customization-parser';

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
  // Allow same-origin requests (internal admin page) without auth
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isSameOrigin =
    origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
    referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
    !origin;

  if (!isSameOrigin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided. Please upload a CSV file.' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .csv and .txt files are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    // Read file as text
    const fileText = await file.text();

    // Detect delimiter (tab-separated or comma-separated)
    // Check first line for tabs
    const firstLine = fileText.split('\n')[0];
    const isTabSeparated = firstLine.includes('\t');
    const delimiter = isTabSeparated ? '\t' : ',';

    // Parse CSV/TSV
    const parseResult = Papa.parse<string[]>(fileText, {
      header: false,
      skipEmptyLines: true,
      delimiter: delimiter,
      transformHeader: (header) => header.trim(),
    });

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
      matched: 0,
      pending: 0,
      errors: 0,
    };

    const matchedOrders: string[] = [];
    const pendingOrders: string[] = [];
    const errors: Array<{ row: number; orderId: string | null; error: string }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2; // +2 because we skip header and are 0-indexed

      try {
        // Extract amazon_order_id
        const amazonOrderId = extractAmazonOrderId(row, headers);
        if (!amazonOrderId) {
          errors.push({
            row: rowNumber,
            orderId: null,
            error: 'Missing or invalid amazon_order_id',
          });
          summary.errors++;
          continue;
        }

        // Query Supabase for order
        const { data: order, error: queryError } = await supabase
          .from('orders')
          .select('amazon_order_id')
          .eq('amazon_order_id', amazonOrderId)
          .single();

        if (queryError || !order) {
          // Order not found - track as pending
          pendingOrders.push(amazonOrderId);
          summary.pending++;
          continue;
        }

        // Build shipping address
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

        // Extract customization URL if available
        const customizationUrl = extractCustomizationUrl(row, headers);
        let characterSpecs = null;

        // Download and parse customization ZIP if URL is present
        if (customizationUrl) {
          try {
            const customizationData = await downloadAndExtractCustomizationZip(customizationUrl);
            if (customizationData) {
              characterSpecs = parseAmazonCustomization(customizationData);
              if (!characterSpecs) {
                console.warn(`[CSV Upload] Failed to parse customization for order ${amazonOrderId}`);
              }
            }
          } catch (customizationError: any) {
            console.error(`[CSV Upload] Error processing customization for order ${amazonOrderId}:`, customizationError);
            // Continue processing even if customization fails
          }
        }

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
        }

        // Update order in Supabase
        // Use updateOrderInSupabase which handles amazon_order_id lookup
        try {
          await updateOrderInSupabase(amazonOrderId, updates);
          matchedOrders.push(amazonOrderId);
          summary.matched++;
        } catch (updateError: any) {
          errors.push({
            row: rowNumber,
            orderId: amazonOrderId,
            error: `Failed to update order: ${updateError?.message || 'Unknown error'}`,
          });
          summary.errors++;
        }
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
    return NextResponse.json({
      success: true,
      summary,
      details: {
        matched_orders: matchedOrders,
        pending_orders: pendingOrders,
        errors: errors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[CSV Upload] Error processing CSV:', error);
    return NextResponse.json(
      {
        error: 'Failed to process CSV file',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

