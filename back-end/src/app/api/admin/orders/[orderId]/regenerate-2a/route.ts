import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/regenerate-2a
 * 
 * Force regeneration of 2A workflow by clearing status fields and triggering workflow.
 * 
 * Clears from 2A manifest:
 * - briaStatusUrl, briaRequestId (if present)
 * - bgRemovedKey, bgRemovedImageUrl (if present)
 * - needsReview, reviewReason, isFlagged (cleared to false/null to start fresh)
 * 
 * Rewinds DB state (mirror regenerate-2b) so W1.1 and any other reader route to 2A, not 3:
 * - workflow_step, manifest_2a_url, manifest_2b_url, manifest_3_url (and related URLs) cleared
 * 
 * Triggers workflow via router: Sets next_workflow: '2A', execution_status: 'ready_for_processing'
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

  try {
    // Get current order (by id or amazon_order_id) to preserve review_stages and get numeric id
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    if (!currentOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    const orderRowId = Number(currentOrder.id);
    if (!Number.isFinite(orderRowId)) {
      return NextResponse.json(
        { error: 'Order row is missing numeric id (cannot queue regenerate safely)' },
        { status: 500 }
      );
    }

    const parseMissingColumn = (err: unknown): string | null => {
      const details = String((err as { details?: string; message?: string })?.details || (err as { message?: string })?.message || '');
      const m = details.match(/Could not find the '([^']+)' column/i) || details.match(/'([^']+)'\s+column/i);
      return m?.[1] ? String(m[1]) : null;
    };
    const updateOrderRowResilientById = async (id: number, updateData: Record<string, unknown>) => {
      let dataToUpdate: Record<string, unknown> = { ...updateData };
      let lastError: unknown = null;
      for (let i = 0; i < 8; i++) {
        const { data, error } = await supabase
          .from('orders')
          .update(dataToUpdate)
          .eq('id', id)
          .select('id');
        if (!error) {
          if (!data || data.length === 0) throw new Error(`Order not found for update (id=${id})`);
          return;
        }
        lastError = error;
        const code = String((error as { code?: string })?.code || '');
        const missingCol = (code === 'PGRST204' || code === '42703') ? parseMissingColumn(error) : null;
        if (!missingCol || !(missingCol in dataToUpdate)) throw error;
        dataToUpdate = { ...dataToUpdate };
        delete dataToUpdate[missingCol];
      }
      throw lastError ?? new Error('Failed to update order');
    };

    const amazonOrderId = (currentOrder as { amazon_order_id?: string }).amazon_order_id ?? orderId.trim();
    // Download 2A manifest if it exists (use amazon_order_id for R2 key)
    const manifest2aKey = buildManifestKey(amazonOrderId, '2a');
    let manifest2a: any = null;
    let manifest2aModified = false;
    try {
      manifest2a = await downloadManifest(manifest2aKey);
    } catch (error: any) {
      // Manifest might not exist yet - that's okay, we'll just trigger the workflow
      console.log(`[Regenerate 2A] 2A manifest not found: ${manifest2aKey}`);
    }

    // Clear status fields from 2A manifest entries if manifest exists
    if (manifest2a && Array.isArray(manifest2a.entries)) {
      let modified = false;
      manifest2a.entries.forEach((entry: any) => {
        let entryModified = false;
        if (entry.briaStatusUrl || entry.briaRequestId || entry.bgRemovedKey || entry.bgRemovedImageUrl) {
          delete entry.briaStatusUrl;
          delete entry.briaRequestId;
          delete entry.bgRemovedKey;
          delete entry.bgRemovedImageUrl;
          entryModified = true;
        }
        // Clear review flags when regenerating (start fresh)
        if (entry.needsReview !== undefined || entry.reviewReason || entry.isFlagged !== undefined) {
          entry.needsReview = false;
          entry.reviewReason = null;
          entry.isFlagged = false;
          entryModified = true;
        }
        if (entryModified) {
          modified = true;
        }
      });

      // Upload modified manifest if changes were made
      if (modified) {
        const manifestJson = JSON.stringify(manifest2a, null, 2);
        await putObject(
          R2_ORDERS_BUCKET,
          manifest2aKey,
          manifestJson,
          'application/json'
        );
        manifest2aModified = true;
        console.log(`[Regenerate 2A] Cleared status fields in 2A manifest: ${manifest2aKey}`);
      }
    }

    // Preserve review_stages when updating
    let review_stages: unknown = (currentOrder as { review_stages?: unknown }).review_stages || {};
    if (typeof review_stages === 'string') {
      try {
        review_stages = JSON.parse(review_stages);
      } catch {
        review_stages = {};
      }
    }

    // Rewind DB state so W1.1 and any reader route to 2A, not 3 (mirror regenerate-2b)
    const queuedAt = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      next_workflow: '2A',
      execution_status: 'ready_for_processing',
      queued_at: queuedAt,
      started_at: null,
      current_workflow: null,
      review_stages,
      workflow_step: 'order_intake',
      manifest_2a_url: '',
      manifest_2b_url: '',
      manifest_3_url: '',
      final_book_url: '',
      final_cover_url: '',
      cover_image_url: '',
      status: 'queued_for_processing',
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
      updated_at: queuedAt,
    };

    await updateOrderRowResilientById(orderRowId, updateData);
    console.log(`[Regenerate 2A] Successfully updated order ${amazonOrderId} (id=${orderRowId}) - next_workflow=2A, manifests rewound`);

    console.log(`[Regenerate 2A] Order ${amazonOrderId} queued for router. Router will pick it up on next cron run.`);

    return NextResponse.json({
      success: true,
      orderId,
      message: '2A workflow regeneration queued. Manifests cleared. Router will pick up this order on next cron run.',
      manifestCleared: manifest2aModified
    });
  } catch (error: any) {
    console.error('[Regenerate 2A] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 2A workflow',
        details: error?.message 
      },
      { status: 500 }
    );
  }
}
