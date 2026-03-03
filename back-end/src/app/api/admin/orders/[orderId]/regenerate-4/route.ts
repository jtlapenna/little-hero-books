import { NextRequest, NextResponse } from 'next/server';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Update order row while tolerating schema drift between environments.
 * If a column doesn't exist (e.g. `lulu_carrier`), drop it and retry.
 */
async function updateOrderRowResilientById(orderRowId: number, updateData: Record<string, unknown>) {
  // PSEUDOCODE
  // - Try UPDATE by primary key `id` (avoids amazon_order_id vs numeric id ambiguity)
  // - If PostgREST reports an unknown column, drop it and retry (schema drift tolerance)
  // - Throw last error if still failing

  const dataToUpdate: Record<string, unknown> = { ...updateData };
  let lastError: any = null;

  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase
      .from('orders')
      .update(dataToUpdate)
      .eq('id', orderRowId)
      .select('id'); // avoid `.single()` response-shape issues

    if (!error) {
      if (!data || data.length === 0) throw new Error(`Order not found for update (id=${orderRowId})`);
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

    const m =
      msg.match(/'([^']+)' column/i) ||
      details.match(/'([^']+)' column/i) ||
      msg.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i) ||
      details.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i);
    const missingCol = m?.[1];
    if (!missingCol) break;
    if (!(missingCol in dataToUpdate)) break;

    console.warn(`[Regenerate 4] Dropping missing column and retrying: ${missingCol}`);
    delete dataToUpdate[missingCol];
  }

  throw lastError || new Error('Failed to update order (unknown error)');
}

/**
 * Restore an order from archived_orders back into orders table.
 * Returns the restored order row, or null if not found in archives.
 */
async function restoreArchivedOrder(orderId: string): Promise<Record<string, unknown> | null> {
  const trimmed = orderId.trim();

  const { data: archivedRow, error: fetchErr } = await supabase
    .from('archived_orders')
    .select('*')
    .or(`order_id.eq.${trimmed},amazon_order_id.eq.${trimmed}`)
    .limit(1)
    .maybeSingle();

  if (fetchErr && fetchErr.code !== 'PGRST116') {
    throw new Error(`Failed to query archived_orders: ${fetchErr.message}`);
  }
  if (!archivedRow?.order_data) return null;

  const orderData: Record<string, unknown> = { ...archivedRow.order_data };
  // Remove PK so the DB assigns a fresh auto-increment id
  delete orderData.id;

  // Schema-drift-tolerant insert: drop unknown columns and retry
  let lastInsertError: any = null;
  for (let i = 0; i < 8; i++) {
    const { data: inserted, error: insertErr } = await supabase
      .from('orders')
      .insert(orderData)
      .select('*')
      .maybeSingle();

    if (!insertErr && inserted) {
      // Successfully restored — remove from archive
      await supabase.from('archived_orders').delete().eq('id', archivedRow.id);
      console.log(`[Regenerate 4] Deleted archive row id=${archivedRow.id} for ${trimmed}`);
      return inserted as Record<string, unknown>;
    }

    lastInsertError = insertErr;
    const msg = String(insertErr?.message || '');
    const details = String(insertErr?.details || '');
    const code = String(insertErr?.code || '');
    const combined = `${msg}\n${details}`.toLowerCase();

    const isUnknownColumn =
      code === 'PGRST204' || code === '42703' ||
      (combined.includes('could not find the') && combined.includes('column')) ||
      (combined.includes('column') && combined.includes('does not exist'));
    if (!isUnknownColumn) break;

    const m =
      msg.match(/'([^']+)' column/i) ||
      details.match(/'([^']+)' column/i) ||
      msg.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i) ||
      details.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i);
    const missingCol = m?.[1];
    if (!missingCol || !(missingCol in orderData)) break;

    console.warn(`[Regenerate 4] Restore: dropping missing column "${missingCol}" and retrying`);
    delete orderData[missingCol];
  }

  throw lastInsertError || new Error('Failed to restore order from archive');
}

/**
 * POST /api/admin/orders/[orderId]/regenerate-4
 * 
 * Force regeneration of 4 workflow (Print Fulfillment) by clearing Lulu status fields and triggering workflow.
 * 
 * Clears Supabase:
 * - lulu_job_id, lulu_status, lulu_cost, lulu_estimated_ship_date
 * - lulu_tracking_number, lulu_tracking_url, lulu_carrier
 * 
 * Triggers workflow: Sets next_workflow: '4', execution_status: 'ready_for_processing'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Allow same-origin requests (internal admin page) without auth
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const isSameOrigin = !origin || 
                       origin?.includes(siteUrl) || 
                       referer?.includes(siteUrl) ||
                       origin?.includes('littleherolabs.com') ||
                       referer?.includes('littleherolabs.com');
  
  if (!isSameOrigin) {
    return NextResponse.json({ 
      error: 'Unauthorized',
      details: 'Request must be from same origin'
    }, { status: 401 });
  }

  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  let body: {
    regeneration_instructions?: string | null;
    reprint_reason?: string | null;
    reprint_note?: string | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    // Empty or invalid JSON body is fine
  }

  try {
    // 1. Try to find in orders table (active / recently_delivered)
    let currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    let wasArchived = false;

    // 2. If not in orders, check archived_orders and restore
    if (!currentOrder) {
      const archived = await restoreArchivedOrder(orderId);
      if (!archived) {
        return NextResponse.json(
          { error: 'Order not found in active orders or archives' },
          { status: 404 }
        );
      }
      currentOrder = archived;
      wasArchived = true;
      console.log(`[Regenerate 4] Restored order ${orderId} from archived_orders`);
    }

    const orderRowId = Number((currentOrder as { id?: unknown }).id);
    if (!Number.isFinite(orderRowId)) {
      return NextResponse.json(
        { error: 'Order row is missing numeric id (cannot queue regenerate safely)' },
        { status: 500 }
      );
    }

    const amazonOrderId = (currentOrder as { amazon_order_id?: string }).amazon_order_id ?? orderId.trim();

    const isReprint =
      wasArchived || String((currentOrder as any).lifecycle_status || '').toLowerCase() === 'recently_delivered';
    const currentReprintCount =
      typeof (currentOrder as any).reprint_count === 'number' ? (currentOrder as any).reprint_count : 0;
    const reprintReasonRaw = typeof body.reprint_reason === 'string' ? body.reprint_reason.trim() : '';
    const reprintNoteRaw = typeof body.reprint_note === 'string' ? body.reprint_note.trim() : '';
    const reprintReason =
      reprintReasonRaw || (wasArchived ? 'restored_from_archive' : 'reprint_after_delivery');
    const reprintNote = reprintNoteRaw || null;

    // Preserve review_stages when updating (parse JSON string if needed)
    let review_stages: unknown = (currentOrder as { review_stages?: unknown }).review_stages || {};
    if (typeof review_stages === 'string') {
      try {
        review_stages = JSON.parse(review_stages);
      } catch {
        review_stages = {};
      }
    }

    const queuedAt = new Date().toISOString();
    await updateOrderRowResilientById(orderRowId, {
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      status: 'queued_for_processing',
      lifecycle_status: 'active',
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
      queued_at: queuedAt,
      started_at: null,
      current_workflow: null,
      review_stages,
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
      updated_at: queuedAt,
      ...(body.regeneration_instructions !== undefined ? { regeneration_instructions: body.regeneration_instructions ?? null } : {}),
      ...(isReprint
        ? {
            reprint_count: currentReprintCount + 1,
            reprint_reason: reprintReason,
            reprint_note: reprintNote,
          }
        : {}),
    });

    const source = wasArchived ? 'restored from archive' : 'active orders';
    console.log(`[Regenerate 4] Queued order ${amazonOrderId} (id=${orderRowId}, ${source}) for W4 regeneration`);

    return NextResponse.json({
      success: true,
      orderId,
      message: `4 regeneration queued (${source}). Router will pick up on next cron run.`,
      luluFieldsCleared: true,
      wasArchived,
    });
  } catch (error: any) {
    console.error('[Regenerate 4] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 4 workflow',
        details: error?.message 
      },
      { status: 500 }
    );
  }
}
