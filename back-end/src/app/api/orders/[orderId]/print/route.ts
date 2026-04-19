import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError, createNotFoundError } from '@/lib/error-handler';
import { normalizeW0Manifest } from '@/lib/books/normalize-w0-manifest';
import { extractManifestKey } from '@/lib/order-paths';
import { downloadManifest } from '@/lib/r2-service';
import { supabase } from '@/lib/supabase-client';
import {
  describeSiblingPrintSubmissionBlockers,
  getPerBookOrderId,
  getRootOrderId,
  getShippingAddressMissingFields,
  getSiblingChildMembers,
  hasWorkflow3Complete,
  isSiblingChildOrder,
} from '@/lib/sibling-print-policy';

type OrderRowLike = Record<string, unknown>;

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickFirstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const trimmed = toTrimmedString(value);
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function normalizeShippingAddressForPrintPreflight(
  shippingAddress: unknown,
): Record<string, unknown> | null {
  const address = toRecord(shippingAddress);
  if (!address) {
    return null;
  }

  const name = pickFirstNonEmpty(address.name, address.recipient_name, address.shippingName);
  const street1 = pickFirstNonEmpty(
    address.street1,
    address.street,
    address.address,
    address.address1,
    address.address_line_1,
    address.address_line1,
  );
  const street2 = pickFirstNonEmpty(
    address.street2,
    address.address2,
    address.address_line_2,
    address.address_line2,
  );
  const city = pickFirstNonEmpty(address.city);
  const state = pickFirstNonEmpty(address.state, address.state_code, address.stateCode);
  const zip = pickFirstNonEmpty(
    address.zip,
    address.postal_code,
    address.postalCode,
    address.postcode,
  );
  const country = pickFirstNonEmpty(
    address.country,
    address.country_code,
    address.countryCode,
  );
  const phone = pickFirstNonEmpty(
    address.phone,
    address.phone_number,
    address.phoneNumber,
  );

  const normalized: Record<string, unknown> = { ...address };

  if (name) normalized.name = name;
  if (street1) {
    normalized.street1 = street1;
    normalized.address = street1;
    normalized.address1 = street1;
    normalized.address_line_1 = street1;
    normalized.address_line1 = street1;
  }
  if (street2) {
    normalized.street2 = street2;
    normalized.address2 = street2;
    normalized.address_line_2 = street2;
    normalized.address_line2 = street2;
  }
  if (city) normalized.city = city;
  if (state) {
    normalized.state = state;
    normalized.state_code = state;
  }
  if (zip) {
    normalized.zip = zip;
    normalized.postal_code = zip;
    normalized.postcode = zip;
  }
  if (country) {
    normalized.country = country;
    normalized.country_code = country;
  }
  if (phone) {
    normalized.phone = phone;
    normalized.phone_number = phone;
  }

  return normalized;
}

async function hydrateOrderShippingAddressForPrint(orderRow: OrderRowLike): Promise<OrderRowLike> {
  const normalizedRowShipping = normalizeShippingAddressForPrintPreflight(orderRow.shipping_address);
  if (getShippingAddressMissingFields(normalizedRowShipping).length === 0) {
    if (normalizedRowShipping) {
      orderRow.shipping_address = normalizedRowShipping;
    }
    return orderRow;
  }

  const manifestKey = extractManifestKey(
    toTrimmedString(orderRow.one_manifest_url) ?? toTrimmedString(orderRow.oneManifestUrl),
  );
  if (!manifestKey) {
    return orderRow;
  }

  try {
    const manifest = await downloadManifest(manifestKey);
    const normalizedManifest = normalizeW0Manifest(manifest, {
      fallbackManifestKey: manifestKey,
    });
    const normalizedManifestShipping = normalizeShippingAddressForPrintPreflight(
      normalizedManifest.shippingAddress,
    );

    if (getShippingAddressMissingFields(normalizedManifestShipping).length > 0) {
      return orderRow;
    }

    orderRow.shipping_address = normalizedManifestShipping;

    const orderRowId = Number(orderRow.id);
    if (Number.isFinite(orderRowId)) {
      await updateOrderRowResilientById(orderRowId, {
        shipping_address: normalizedManifestShipping,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn('[POST /api/orders/[orderId]/print] Failed to hydrate shipping from one-manifest:', {
      orderId: getPerBookOrderId(orderRow),
      manifestKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return orderRow;
}

function parseMissingColumn(error: unknown): string | null {
  const msg = String((error as { message?: string })?.message || '');
  const details = String((error as { details?: string })?.details || '');

  const match =
    msg.match(/'([^']+)' column/i) ||
    details.match(/'([^']+)' column/i) ||
    msg.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i) ||
    details.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i);

  return match?.[1] ?? null;
}

/**
 * Update an order row while tolerating optional-column drift between environments.
 * If PostgREST reports an unknown column, drop it and retry.
 */
async function updateOrderRowResilientById(orderRowId: number, updateData: Record<string, unknown>) {
  const dataToUpdate: Record<string, unknown> = { ...updateData };
  let lastError: unknown = null;

  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase
      .from('orders')
      .update(dataToUpdate as never)
      .eq('id', orderRowId)
      .select('id');

    if (!error) {
      if (!data || data.length === 0) {
        throw new Error(`Order not found for update (id=${orderRowId})`);
      }
      return;
    }

    lastError = error;
    const msg = String(error?.message || '');
    const details = String(error?.details || '');
    const code = String(error?.code || '');
    const combined = `${msg}\n${details}`.toLowerCase();

    const isUnknownColumn =
      code === 'PGRST204' ||
      code === '42703' ||
      (combined.includes('could not find the') && combined.includes('column')) ||
      (combined.includes('column') && combined.includes('does not exist'));
    if (!isUnknownColumn) break;

    const missingColumn = parseMissingColumn(error);
    if (!missingColumn || !(missingColumn in dataToUpdate)) break;

    console.warn(`[POST /api/orders/[orderId]/print] Dropping missing column and retrying: ${missingColumn}`);
    delete dataToUpdate[missingColumn];
  }

  throw lastError || new Error('Failed to update order (unknown error)');
}

async function updateOrderRowsResilientByIds(orderRowIds: number[], updateData: Record<string, unknown>) {
  const uniqueOrderRowIds = [...new Set(orderRowIds.filter((id) => Number.isFinite(id)))];
  if (uniqueOrderRowIds.length === 0) {
    throw new Error('No valid order row ids provided for update');
  }

  const dataToUpdate: Record<string, unknown> = { ...updateData };
  let lastError: unknown = null;

  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase
      .from('orders')
      .update(dataToUpdate as never)
      .in('id', uniqueOrderRowIds)
      .select('id');

    if (!error) {
      const updatedIds = new Set(
        (data ?? [])
          .map((row) => Number((row as { id?: unknown }).id))
          .filter((id) => Number.isFinite(id)),
      );
      if (updatedIds.size !== uniqueOrderRowIds.length) {
        throw new Error(
          `Expected ${uniqueOrderRowIds.length} order rows updated, got ${updatedIds.size}`,
        );
      }
      return;
    }

    lastError = error;
    const msg = String(error?.message || '');
    const details = String(error?.details || '');
    const code = String(error?.code || '');
    const combined = `${msg}\n${details}`.toLowerCase();

    const isUnknownColumn =
      code === 'PGRST204' ||
      code === '42703' ||
      (combined.includes('could not find the') && combined.includes('column')) ||
      (combined.includes('column') && combined.includes('does not exist'));
    if (!isUnknownColumn) break;

    const missingColumn = parseMissingColumn(error);
    if (!missingColumn || !(missingColumn in dataToUpdate)) break;

    console.warn(
      `[POST /api/orders/[orderId]/print] Dropping missing column and retrying batch update: ${missingColumn}`,
    );
    delete dataToUpdate[missingColumn];
  }

  throw lastError || new Error('Failed to update orders (unknown error)');
}

async function updateOrderStatusResilient(
  orderRowId: number,
  orderLookupId: string,
  updates: Record<string, unknown>,
) {
  const { calculateOrderStatus } = await import('@/lib/status-service');

  await updateOrderRowResilientById(orderRowId, {
    ...updates,
    updated_at: new Date().toISOString(),
  });

  const calculatedStatus = await calculateOrderStatus(orderLookupId);

  if (updates.status !== calculatedStatus) {
    await updateOrderRowResilientById(orderRowId, {
      status: calculatedStatus,
      updated_at: new Date().toISOString(),
    });
  }
}

async function updateOrderStatusesResilient(
  orderTargets: Array<{ orderRowId: number; orderLookupId: string }>,
  updates: Record<string, unknown>,
) {
  const { calculateOrderStatus } = await import('@/lib/status-service');

  await updateOrderRowsResilientByIds(
    orderTargets.map((target) => target.orderRowId),
    {
      ...updates,
      updated_at: new Date().toISOString(),
    },
  );

  for (const target of orderTargets) {
    const calculatedStatus = await calculateOrderStatus(target.orderLookupId);
    if (updates.status !== calculatedStatus) {
      await updateOrderRowResilientById(target.orderRowId, {
        status: calculatedStatus,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

async function validateOrderReadinessForPrint(orderRow: OrderRowLike, targetOrderId: string) {
  const hydratedOrder = await hydrateOrderShippingAddressForPrint(orderRow);
  const missingShippingFields = getShippingAddressMissingFields(orderRow.shipping_address);
  if (missingShippingFields.length > 0) {
    const platform = String(hydratedOrder.platform || '').toLowerCase();
    const shippingMessage =
      missingShippingFields[0] === 'shipping_address'
        ? platform === 'd2c'
          ? 'shipping information is not available on the order row or 1-manifest.'
          : 'shipping information not yet available. Please upload CSV to populate customer data.'
        : platform === 'd2c'
          ? `shipping information is incomplete. Missing: ${missingShippingFields.join(', ')}.`
          : `shipping information is incomplete. Missing: ${missingShippingFields.join(', ')}. Please upload CSV to populate customer data.`;
    throw createValidationError(
      `Order cannot be sent to print fulfillment: ${shippingMessage}`,
    );
  }

  if (!hasWorkflow3Complete(hydratedOrder)) {
    throw createValidationError(
      `Order ${targetOrderId} cannot be sent to print: book assembly (workflow 3) has not completed. 3-manifest not found.`,
    );
  }
}

/**
 * Queue order for 4 workflow (Print Fulfillment) via router
 * POST /api/orders/[orderId]/print
 *
 * This endpoint queues the order for the router system instead of calling
 * the n8n webhook directly, ensuring we respect the 5-execution limit.
 */
async function sendToPrint(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  console.log(`[POST /api/orders/[orderId]/print] Queueing order ${orderId} for 4 workflow via router`);

  const { getOrderFromSupabase, listOrdersByAmazonRootId, updateOrderInSupabase } = await import(
    '@/lib/supabase-client'
  );

  try {
    let body: { source?: string; reprint_reason?: string; reprint_note?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const currentOrder = (await getOrderFromSupabase(orderId).catch(() => null)) as OrderRowLike | null;
    if (!currentOrder) {
      throw createNotFoundError(`Order ${orderId} not found`);
    }

    const currentOrderRowId = Number(currentOrder.id);
    if (!Number.isFinite(currentOrderRowId)) {
      throw new Error(`Order ${orderId} is missing numeric id; cannot queue print safely`);
    }

    const currentPerBookOrderId = getPerBookOrderId(currentOrder) || orderId;
    const currentRootOrderId = getRootOrderId(currentOrder);
    const isReprint = String(currentOrder.lifecycle_status || '').toLowerCase() === 'recently_delivered';

    await validateOrderReadinessForPrint(currentOrder, currentPerBookOrderId);

    let orderTargets = [
      {
        orderRowId: currentOrderRowId,
        orderLookupId: currentPerBookOrderId,
      },
    ];

    if (!isReprint && isSiblingChildOrder(currentOrder)) {
      const siblingRows = (await listOrdersByAmazonRootId(currentRootOrderId)) as OrderRowLike[];
      const siblingMembers = await Promise.all(
        getSiblingChildMembers(siblingRows, currentRootOrderId).map((member) =>
          hydrateOrderShippingAddressForPrint(member),
        ),
      );

      if (siblingMembers.length < 2) {
        throw createValidationError(
          `Sibling order ${currentPerBookOrderId} must be sent to print as a group, but only ${siblingMembers.length} sibling row${siblingMembers.length === 1 ? '' : 's'} were found for root order ${currentRootOrderId}.`,
        );
      }

      const blockedMembers = siblingMembers
        .map((member) => {
          const memberOrderId = getPerBookOrderId(member);
          const blockers = describeSiblingPrintSubmissionBlockers(member);
          return memberOrderId && blockers.length > 0
            ? { orderId: memberOrderId, blockers }
            : null;
        })
        .filter((entry): entry is { orderId: string; blockers: string[] } => !!entry);

      if (blockedMembers.length > 0) {
        const detail = blockedMembers
          .map((member) => `${member.orderId}: ${member.blockers.join('; ')}`)
          .join(' | ');
        throw createValidationError(
          `Sibling orders must be sent to print together. The group for root order ${currentRootOrderId} is not fully ready: ${detail}`,
        );
      }

      orderTargets = siblingMembers.map((member) => {
        const memberRowId = Number(member.id);
        const memberOrderId = getPerBookOrderId(member);

        if (!Number.isFinite(memberRowId) || !memberOrderId) {
          throw new Error(
            `Sibling order ${memberOrderId || '(unknown)'} is missing required identifiers; cannot queue group print safely`,
          );
        }

        return {
          orderRowId: memberRowId,
          orderLookupId: memberOrderId,
        };
      });
    }

    const updates: Record<string, unknown> = {
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      status: 'queued_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null,
      error_type: null,
      error_message: null,
      lulu_job_id: null,
      lulu_status: null,
      lulu_cost: null,
      lulu_estimated_ship_date: null,
      lulu_tracking_number: null,
      lulu_tracking_url: null,
      lulu_carrier: null,
      printFulfillmentStatus: null,
      printFulfillmentStartedAt: null,
      printFulfillmentFinishedAt: null,
      // Admin "Send to Print" bypasses customer approval; set approved so cron router includes the order.
      customer_approval_status: 'approved',
    };

    if (orderTargets.length === 1) {
      await updateOrderStatusResilient(
        orderTargets[0].orderRowId,
        orderTargets[0].orderLookupId,
        updates,
      );
    } else {
      await updateOrderStatusesResilient(orderTargets, updates);
    }

    if (isReprint) {
      const currentCount = typeof currentOrder.reprint_count === 'number' ? currentOrder.reprint_count : 0;
      const reason = (body.reprint_reason || '').trim() || 'reprint_after_delivery';
      const note = (body.reprint_note || '').trim() || null;
      await updateOrderInSupabase(currentPerBookOrderId, {
        reprint_count: currentCount + 1,
        reprint_reason: reason,
        reprint_note: note,
      });
    }

    const grouped = orderTargets.length > 1;
    const queuedOrderIds = orderTargets.map((target) => target.orderLookupId);

    console.log(
      `[POST /api/orders/[orderId]/print] ✅ Queued ${grouped ? `${orderTargets.length} sibling orders` : 'order'} ${queuedOrderIds.join(', ')} for W4 via router`,
    );

    return NextResponse.json({
      success: true,
      message: grouped
        ? `Queued ${orderTargets.length} sibling orders for print fulfillment. Router will process the group together when capacity is available.`
        : 'Order queued for print fulfillment workflow. Router will process it when capacity is available.',
      orderId: currentPerBookOrderId,
      queuedOrderIds,
      rootOrderId: grouped ? currentRootOrderId : null,
      grouped,
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      isReprint,
    });
  } catch (error: unknown) {
    console.error(`[POST /api/orders/[orderId]/print] Error queueing order:`, error);
    if (error instanceof NextResponse) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to queue order for print fulfillment workflow: ${message}`);
  }
}

export const POST = withErrorHandling(sendToPrint);
