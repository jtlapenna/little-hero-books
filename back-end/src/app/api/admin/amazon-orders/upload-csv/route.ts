import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import Papa from 'papaparse';
import { OVERNIGHT_TEST_FORM_FIELD, OVERNIGHT_TEST_MARKER } from '@/lib/messaging/test-order-guard';
import {
  validateCsvHeaders,
  findColumnIndex,
  extractAmazonOrderId,
  extractOrderItemId,
  buildShippingAddress,
  extractCustomerName,
  extractCustomerEmail,
  extractCustomizationUrl,
  extractPurchaseDate,
  buildLineItemFromRow,
  readCsvItemSelectionRows,
} from '@/lib/csv-upload-helpers';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { downloadAndExtractCustomizationZip } from '@/lib/zip-downloader';
import { parseAmazonCustomization } from '@/lib/amazon-customization-parser';
import {
  calculateSiblingCharacterHash,
  buildSiblingOrderId,
  buildSiblingOrderRow,
  buildW0Payload,
  triggerW0,
} from '@/lib/sibling-order-helpers';
import { requireAdminAuth } from '@/lib/admin-auth';
import { resolveCsvBookSelection, CsvBookSelectionError, csvBookSpecs, readCsvRootRows, reconcileCsvRoot,
  resolveCsvOriginalContext, updateExactCsvRow, csvRowDeclaresInnerVoice, assertCompleteCsvRootUnits,
  readCsvItemBookSelections, validateCsvItemBookChoiceCoverage, resolveCsvRootItemSelections, csvItemBookChoiceKey,
  csvItemBookSpecs, resolveCsvOriginalItemContext, type CsvResolvedItemSelection, type CsvItemBookChoice, type CsvUnitDescriptor } from '@/lib/csv-book-selection';
import { ADMIN_BODY_LIMITS, readBoundedRequestFormData, RequestBodyError } from '@/lib/request-body';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AMAZON_CSV_BOOK_ID = 'book-mvp-simple-adventure';
const AMAZON_CSV_FORMAT_ID = 'amazon';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CSV_REQUEST_BYTES = ADMIN_BODY_LIMITS.csvUpload;

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
    // Purpose: fail-closed admin auth (verified Access identity OR machine Bearer token).
    const adminAuth = await requireAdminAuth(request);
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
    const formData = await readBoundedRequestFormData(request, MAX_CSV_REQUEST_BYTES);
    const file = formData.get('file');
    // Explicit opt-in (default off): only the exact string 'true' marks created/updated orders as overnight
    // test orders, which suppresses every customer/buyer message for them (see lib/messaging/test-order-guard).
    const overnightTest = formData.get(OVERNIGHT_TEST_FORM_FIELD) === 'true';
    console.log(`[CSV Upload] [${requestId}] File received: ${file && typeof file !== 'string' ? `name=${file.name}, size=${file.size} bytes` : 'null'}`);

    if (!file || typeof file === 'string') {
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

    const dataRows = rows.slice(1);
    const itemChoices = readCsvItemBookSelections(formData);
    if (itemChoices) {
      try {
        const sourceRows = readCsvItemSelectionRows(headers, dataRows as string[][]);
        validateCsvItemBookChoiceCoverage(itemChoices, sourceRows);
      } catch (error) {
        if (error instanceof CsvBookSelectionError) throw error;
        throw new CsvBookSelectionError(error instanceof Error ? error.message : 'Invalid mixed CSV source declarations');
      }
    }
    const selection = itemChoices ? undefined : await resolveCsvBookSelection(formData);
    const strictSelection = !!selection || !!itemChoices;
    const confirmedSelections: Array<CsvItemBookChoice & { configVersion: number }> = [];
    const itemPreflight = new Map<string, {
      rows: Record<string, unknown>[]; selections: Map<string, CsvResolvedItemSelection>;
    }>();

    // Process rows: group by amazon-order-id, then create ONE order per row
    // (primary for first row, sibling for subsequent rows in same group)
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
    const invalidRoots = new Set<string>();
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
        invalidRoots.add(amazonOrderId);
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

    if (itemChoices) {
      if (summary.errors || invalidRoots.size) throw new CsvBookSelectionError('Mixed CSV requires valid shipping and identity for every source row.');
      for (const [root, group] of orderIdToRows) {
        let stored: Record<string, unknown>[];
        try { stored = await readCsvRootRows(supabase, root, [{ orderId: root }]); }
        catch { throw new CsvBookSelectionError('Mixed root membership could not be verified.', 503); }
        try {
          const choices = itemChoices.filter(choice => choice.rootOrderId === root);
          const items = group.map(({ row }) => buildLineItemFromRow(row as string[], headers));
          const selections = await resolveCsvRootItemSelections(root, choices, items, stored);
          itemPreflight.set(root, { rows: stored, selections });
          for (const choice of choices) {
            const key = JSON.stringify([choice.rootOrderId, choice.source.kind, choice.source.value]);
            const resolved = selections.get(key);
            if (!resolved) throw new Error('Missing resolved source book selection');
            confirmedSelections.push({ ...choice, ...resolved.tuple });
          }
        } catch (error) {
          if (error instanceof CsvBookSelectionError) throw error;
          throw new CsvBookSelectionError(error instanceof Error ? error.message : 'Mixed source context could not be verified.', 409);
        }
      }
      if (confirmedSelections.length !== itemChoices.length) throw new CsvBookSelectionError('Incomplete mixed CSV selection confirmation', 409);
    }

    for (const [amazonOrderId, group] of orderIdToRows) {
      const firstRow = group[0].row;
      const shippingAddress = buildShippingAddress(firstRow, headers)!;
      const customerName = extractCustomerName(firstRow, headers);
      const customerEmail = extractCustomerEmail(firstRow, headers);
      const purchaseDate = extractPurchaseDate(firstRow, headers);

      if (strictSelection) {
        const quantityColumn = findColumnIndex(headers, ['quantity-purchased', 'quantity_purchased', 'quantity']);
        const invalidQuantity = group.some(({ row }) => {
          if (quantityColumn === null) return false;
          const raw = String((row as string[])[quantityColumn] ?? '').trim();
          return !/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw));
        });
        const totalQuantity = group.reduce((sum, { row }) => sum + (quantityColumn === null ? 1 : Number(String((row as string[])[quantityColumn] ?? '').trim())), 0);
        if (invalidRoots.has(amazonOrderId) || invalidQuantity || !Number.isSafeInteger(totalQuantity) || totalQuantity > 200) {
          errors.push({ row: group[0].rowNumber, orderId: amazonOrderId,
            error: 'Amazon root has invalid rows or quantities. Upload its complete corrected group.' });
          summary.errors++;
          continue;
        }
      }

      // Download customization per row (each row may be a different child)
      const rowSpecs: Array<{
        rowNumber: number;
        orderItemId: string | null;
        unitIndex: number;
        unitCount: number;
        customizationUrl: string | null;
        customizedUrlHash: string | null;
        lineItem: Record<string, unknown>;
        characterSpecs: Record<string, unknown> | null;
        customizationFailure: string | null;
      }> = [];
      const sourceLineItems: Record<string, unknown>[] = [];

      for (const { row, rowNumber } of group) {
        const orderItemId = extractOrderItemId(row as string[], headers);
        const customizationUrl = extractCustomizationUrl(row as string[], headers);
        const parsedSourceLineItem = buildLineItemFromRow(row as string[], headers);
        const sourceLineItem: Record<string, unknown> = itemChoices
          ? JSON.parse(JSON.stringify(parsedSourceLineItem))
          : parsedSourceLineItem;
        sourceLineItems.push(sourceLineItem);
        const quantity =
          typeof sourceLineItem.quantity === 'number' && Number.isFinite(sourceLineItem.quantity)
            ? Math.max(1, Math.floor(sourceLineItem.quantity))
            : 1;
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
        for (let unitIndex = 1; unitIndex <= quantity; unitIndex++) {
          rowSpecs.push({
            rowNumber,
            orderItemId,
            unitIndex,
            unitCount: quantity,
            customizationUrl: customizationUrl ?? null,
            customizedUrlHash,
            lineItem: {
              ...sourceLineItem,
              quantity: 1,
              source_quantity: quantity,
              quantity_unit_index: unitIndex,
            },
            characterSpecs: specs,
            customizationFailure: failure,
          });
        }
      }

      // Process each row as its own order
      const totalUnits = rowSpecs.length;
      let units: CsvUnitDescriptor[] = rowSpecs.map((item, index) => {
        const suffixBase = (item.orderItemId?.trim() || item.customizedUrlHash || String(index + 1)).trim();
        const suffix = item.unitCount > 1 ? `${suffixBase}-unit-${item.unitIndex}` : suffixBase;
        return { orderId: totalUnits > 1 ? buildSiblingOrderId(amazonOrderId, suffix) : amazonOrderId,
          lineItem: item.lineItem, unitIndex: item.unitIndex, unitCount: item.unitCount,
          itemKey: item.orderItemId ? `item:${item.orderItemId}` : item.customizedUrlHash ? `custom:${item.customizedUrlHash}` : null };
      });
      let exactRows = new Map<string, Record<string, unknown>>();
      let placeholderOrderId: string | null = null;
      let itemSelections: Map<string, CsvResolvedItemSelection> | undefined;
      const originals = new Map<string, { specs: Record<string, unknown>; hash: string }>();
      try {
        const members = await readCsvRootRows(supabase, amazonOrderId, strictSelection ? [{ orderId: amazonOrderId }, ...units] : units);
        if (itemChoices) {
          const staged = itemPreflight.get(amazonOrderId);
          if (!staged || members.length !== staged.rows.length || members.some(row => !staged.rows.some(original => original.id === row.id && isDeepStrictEqual(original, row)))) {
            throw new Error('Mixed CSV root changed after selection preflight');
          }
          itemSelections = staged.selections;
          for (const item of sourceLineItems) {
            const resolved = itemSelections.get(csvItemBookChoiceKey(amazonOrderId, item));
            if (!resolved) throw new Error('Missing resolved CSV source book');
            item.bookSelection = resolved.tuple;
          }
          units = units.map(unit => {
            const resolved = itemSelections!.get(csvItemBookChoiceKey(amazonOrderId, unit.lineItem));
            if (!resolved) throw new Error('Missing resolved CSV unit book');
            return { ...unit, lineItem: { ...unit.lineItem, bookSelection: resolved.tuple }, lineItems: sourceLineItems };
          });
        }
        const plan = reconcileCsvRoot(members, amazonOrderId, units, selection, itemSelections);
        units = plan.units; exactRows = plan.matches; placeholderOrderId = plan.placeholderOrderId;
        if (strictSelection) {
          const confirmed = await readCsvRootRows(supabase, amazonOrderId, [{ orderId: amazonOrderId }, ...units]);
          if (confirmed.length !== members.length || confirmed.some(row => !members.some(original => original.id === row.id && isDeepStrictEqual(original, row)))) {
            throw new Error('CSV root or destination changed during planning');
          }
        }
        if (strictSelection) for (let index = 0; index < units.length; index++) {
          const unit = units[index], original = exactRows.get(unit.orderId), parsed = rowSpecs[index].characterSpecs;
          originals.set(unit.orderId, itemSelections
            ? await resolveCsvOriginalItemContext(unit.selection!, unit, original, parsed, amazonOrderId, placeholderOrderId === unit.orderId)
            : await resolveCsvOriginalContext(selection!, unit, original, parsed, amazonOrderId, placeholderOrderId === unit.orderId));
        }
      } catch (error) {
        errors.push({ row: group[0].rowNumber, orderId: amazonOrderId,
          error: error instanceof Error ? error.message : String(error) });
        summary.errors++;
        continue;
      }
      const deferW0 = !!itemSelections || (!!selection && totalUnits > 1);
      const errorsBeforeRoot = summary.errors;
      const deferred: Array<{ orderId: string; payload: ReturnType<typeof buildW0Payload> }> = [];
      const savedPhysicalIds = new Map<string, number>();
      const writeIndices = rowSpecs.map((_, index) => index);
      if (placeholderOrderId !== null) writeIndices.sort((a, b) =>
        units[a].orderId === placeholderOrderId ? -1 : units[b].orderId === placeholderOrderId ? 1 : a - b);
      for (const idx of writeIndices) {
        const {
          rowNumber,
          orderItemId,
          unitIndex,
          unitCount,
          lineItem: parsedLineItem,
          characterSpecs: parsedCharacterSpecs,
          customizationFailure,
          customizedUrlHash,
        } = rowSpecs[idx];
        const unitSelection = units[idx].selection;
        const configuredSelection = unitSelection?.configured ?? selection;
        const selectedBookId = unitSelection?.tuple.bookId ?? selection?.bookId ?? AMAZON_CSV_BOOK_ID;
        const selectedFormatId = unitSelection?.tuple.formatId ?? selection?.formatId ?? AMAZON_CSV_FORMAT_ID;
        const lineItem = strictSelection ? units[idx].lineItem : parsedLineItem;
        const unitSourceItems = strictSelection ? (units[idx].lineItems ?? sourceLineItems) : sourceLineItems;
        const isMultiUnitOrder = totalUnits > 1;
        const isSibling = isMultiUnitOrder;
        const effectiveOrderId = units[idx].orderId;
        const original = originals.get(effectiveOrderId);
        const characterSpecs = strictSelection ? original!.specs : parsedCharacterSpecs;

        try {
          // Purpose: existence check by per-book identity (orderId), not amazon_order_id.
          const existing = strictSelection ? exactRows.get(effectiveOrderId) : await getOrderFromSupabase(effectiveOrderId);
          if (existing) {
            const existingRecord = existing as Record<string, unknown>;
            if (!strictSelection && csvRowDeclaresInnerVoice(existingRecord)) {
              throw new CsvBookSelectionError('This Amazon root contains Inner Voice; use its complete selected-book intake');
            }
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
              updates.character_hash = strictSelection ? original!.hash : calculateSiblingCharacterHash(characterSpecs);
            }
            if (existingRecord.review_stages) updates.review_stages = existingRecord.review_stages;
            updates.product_info = {
              ...(((existingRecord.product_info as Record<string, unknown> | null) ?? {})),
              _created_via_csv: true,
              _csv_sibling_index: idx,
              _customized_url_hash: customizedUrlHash,
              bookId: selectedBookId,
              book_id: selectedBookId,
              formatId: selectedFormatId,
              format_id: selectedFormatId,
              bookSpecs: unitSelection ? csvItemBookSpecs(unitSelection, characterSpecs!) : selection ? csvBookSpecs(selection) : {
                bookId: selectedBookId,
                formatId: selectedFormatId,
                title: `${(characterSpecs?.childName as string) ?? 'Child'} and the Adventure Compass`,
                totalPages: 16,
                format: '8.5x8.5_softcover',
                bookType: 'adventure',
                channel: 'amazon',
              },
              line_item: lineItem,
              line_items: unitSourceItems,
              _quantity_unit_index: unitIndex,
              _quantity_unit_count: unitCount,
              ...(overnightTest ? { [OVERNIGHT_TEST_MARKER]: true } : {}),
              ...(isSibling ? { _sibling_order: true, _parent_amazon_order_id: amazonOrderId, _order_item_id: orderItemId ?? null } : {}),
            };

            if (strictSelection) {
              const metadata = unitSelection ? csvItemBookSpecs(unitSelection, characterSpecs!) : csvBookSpecs(selection!);
              updates.book_specs = metadata;
              updates.dedication_text = characterSpecs!.dedication ?? null;
              const info = updates.product_info as Record<string, unknown>;
              info.configVersion = unitSelection?.tuple.configVersion ?? selection!.configVersion;
              info.book_specs = metadata;
              delete info._customization_missing;
              delete info._retry_on_next_cron;
            }
            try {
              await updateExactCsvRow(supabase, existingRecord, effectiveOrderId, updates, strictSelection);
              if (deferW0) savedPhysicalIds.set(effectiveOrderId, existingRecord.id as number);
              matchedOrders.push(effectiveOrderId);
              summary.matched++;
            } catch (ue: unknown) {
              const msg = ue instanceof Error ? ue.message : String(ue);
              errors.push({ row: rowNumber, orderId: effectiveOrderId, error: `Update failed: ${msg}` });
              summary.errors++;
              if (effectiveOrderId === placeholderOrderId) break;
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

            const characterHash = strictSelection ? original!.hash : calculateSiblingCharacterHash(characterSpecs);
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
              bookId: selectedBookId,
              formatId: selectedFormatId,
              ...(configuredSelection ? { selection: configuredSelection } : {}),
              lineItem,
              lineItems: unitSourceItems,
              unitIndex,
              unitCount,
            });
            // Purpose: stable debug keys for re-upload + recovery.
            const orderRowRecord = orderRow as Record<string, unknown>;
            orderRowRecord.product_info = {
              ...(((orderRowRecord.product_info as Record<string, unknown> | null) ?? {})),
              _csv_sibling_index: idx,
              _customized_url_hash: customizedUrlHash,
              line_item: lineItem,
              line_items: unitSourceItems,
              ...(overnightTest ? { [OVERNIGHT_TEST_MARKER]: true } : {}),
            };

            if (unitSelection) {
              const metadata = csvItemBookSpecs(unitSelection, characterSpecs);
              orderRowRecord.book_specs = metadata;
              Object.assign(orderRowRecord.product_info as Record<string, unknown>, unitSelection.tuple,
                { bookSpecs: metadata, book_specs: metadata });
            }

            const { data: inserted, error: insertError } = await supabase
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

            if (deferW0) {
              if (typeof inserted?.id !== 'number' || !Number.isSafeInteger(inserted.id) || inserted.id <= 0) throw new Error('CSV insert did not return its physical row ID');
              savedPhysicalIds.set(effectiveOrderId, inserted.id);
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

          const specsForW0 = (strictSelection ? original!.specs : characterSpecs) ?? (await (async () => {
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

          const charHash = strictSelection ? original!.hash : calculateSiblingCharacterHash(specsForW0);
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
            bookId: selectedBookId,
            formatId: selectedFormatId,
            ...(configuredSelection ? { selection: configuredSelection } : {}),
            lineItem,
            lineItems: strictSelection ? unitSourceItems : [lineItem],
            unitIndex,
            unitCount,
          });

          if (unitSelection) {
            const metadata = csvItemBookSpecs(unitSelection, specsForW0);
            Object.assign(payload, unitSelection.tuple, { bookSpecs: metadata, book_specs: metadata });
          }
          if (deferW0) { deferred.push({ orderId: effectiveOrderId, payload }); continue; }
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
          if (effectiveOrderId === placeholderOrderId) break;
        }
      }
      if (deferW0) {
        let holdReason: string | undefined;
        if (summary.errors !== errorsBeforeRoot || deferred.length !== units.length || savedPhysicalIds.size !== units.length) {
          holdReason = 'CSV root has incomplete writes; saved books remain pending';
        } else {
          try {
            const stored = await readCsvRootRows(supabase, amazonOrderId, [{ orderId: amazonOrderId }, ...units]);
            assertCompleteCsvRootUnits(stored, amazonOrderId);
            const verified = reconcileCsvRoot(stored, amazonOrderId, units, selection, itemSelections);
            if (verified.placeholderOrderId !== null || verified.units.some((unit, index) => unit.orderId !== units[index].orderId) || verified.matches.size !== units.length) throw new Error('CSV saved root identity changed');
            for (const unit of units) {
              const row = verified.matches.get(unit.orderId), original = originals.get(unit.orderId)!;
              if (!row || row.id !== savedPhysicalIds.get(unit.orderId) || !isDeepStrictEqual(row.shipping_address, shippingAddress) ||
                  (customerName != null && row.customer_name !== customerName) || (customerEmail != null && row.customer_email !== customerEmail)) throw new Error('CSV saved root changed before W0');
              if (itemSelections) {
                const freshUnit = verified.units.find(candidate => candidate.orderId === unit.orderId);
                if (!freshUnit || !isDeepStrictEqual(freshUnit.lineItem, unit.lineItem) ||
                    !isDeepStrictEqual(freshUnit.lineItems, unit.lineItems)) throw new Error('Mixed CSV saved unit context changed before W0');
                await resolveCsvOriginalItemContext(unit.selection!, unit, row, original.specs, amazonOrderId, false);
              }
              else await resolveCsvOriginalContext(selection!, unit, row, original.specs, amazonOrderId, false);
            }
          } catch (error) {
            holdReason = error instanceof Error ? error.message : 'CSV complete root could not be verified';
            errors.push({ row: group[0].rowNumber, orderId: amazonOrderId, error: holdReason }); summary.errors++;
          }
        }
        if (holdReason) {
          for (const orderId of savedPhysicalIds.keys()) w0Skipped.push({ orderId, reason: holdReason });
        } else {
          for (const item of deferred) {
            const result = await triggerW0(item.payload);
            if (result.ok) w0Triggered.push(item.orderId);
            else w0Skipped.push({ orderId: item.orderId, reason: result.error ?? 'unknown' });
          }
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
      ...(selection ? { selection: { bookId: selection.bookId, formatId: selection.formatId,
        configVersion: selection.configVersion, title: selection.title } } : {}),
      ...(itemChoices ? { itemSelections: confirmedSelections } : {}),
      timestamp: new Date().toISOString(),
      request_id: requestId,
    };
    
    console.log(`[CSV Upload] [${requestId}] ====== Request Completed Successfully ======`);
    console.log(`[CSV Upload] [${requestId}] Summary: ${summary.total_orders} group(s), ${summary.created} created (${summary.sibling_created} siblings), ${summary.matched} matched, ${summary.errors} errors`);
    console.log(`[CSV Upload] [${requestId}] W0 triggered for: ${w0Triggered.length} order(s)`);
    
    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof RequestBodyError || error instanceof CsvBookSelectionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
