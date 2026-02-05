import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/regenerate-3
 * 
 * Force regeneration of 3 workflow (Book Assembly) by clearing status fields and triggering workflow.
 * 
 * Clears from 3 manifest:
 * - finalBookUrl, finalCoverUrl
 * 
 * Rewinds DB state so W1.1 routes to 3 (not 4): workflow_step, manifest_3_url, final_*_url cleared.
 * 
 * Triggers workflow: Sets next_workflow: '3', execution_status: 'ready_for_processing'
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
    // Get current order to preserve review_stages and get numeric id / amazon_order_id
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
    // Download 3 manifest if it exists — use amazon_order_id for R2 key
    const manifest3Key = buildManifestKey(amazonOrderId, '3');
    let manifest3: any = null;
    let manifest3Modified = false;
    try {
      manifest3 = await downloadManifest(manifest3Key);
      
      // Clear final book/cover URLs from manifest
      if (manifest3) {
        if (manifest3.finalBookUrl || manifest3.finalCoverUrl || 
            manifest3.bookUrl || manifest3.coverUrl ||
            manifest3.order?.finalBookUrl || manifest3.order?.finalCoverUrl) {
          delete manifest3.finalBookUrl;
          delete manifest3.finalCoverUrl;
          delete manifest3.bookUrl;
          delete manifest3.coverUrl;
          if (manifest3.order) {
            delete manifest3.order.finalBookUrl;
            delete manifest3.order.finalCoverUrl;
          }
          manifest3Modified = true;
        }
      }
    } catch (error: any) {
      console.log(`[Regenerate 3] 3 manifest not found: ${manifest3Key}`);
    }

    // Upload modified manifest if changes were made
    if (manifest3Modified && manifest3) {
      const manifestJson = JSON.stringify(manifest3, null, 2);
      await putObject(
        R2_ORDERS_BUCKET,
        manifest3Key,
        manifestJson,
        'application/json'
      );
      console.log(`[Regenerate 3] Cleared final URLs in 3 manifest: ${manifest3Key}`);
    }

    // Preserve review_stages when updating
    // review_stages might be a JSON string from Supabase, parse it if needed
    let review_stages = currentOrder.review_stages || {};
    if (typeof review_stages === 'string') {
      try {
        review_stages = JSON.parse(review_stages);
      } catch (e) {
        console.warn(`[Regenerate 3] Failed to parse review_stages, using empty object:`, e);
        review_stages = {};
      }
    }

    /**
     * Clear Supabase fields and queue workflow 3.
     * NOTE: use empty strings for URL fields because some schemas store them as non-null text.
     */
    const queuedAt = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      next_workflow: '3',
      execution_status: 'ready_for_processing',
      queued_at: queuedAt,
      started_at: null,
      current_workflow: null,
      // Clear outputs so downstream logic doesn’t treat assembly as already complete
      manifest_3_url: '',
      workflow_step: '2B-complete',
      final_book_url: '',
      // Some schemas use `cover_image_url` instead of `final_cover_url` (or may not have `final_cover_url`)
      final_cover_url: '',
      cover_image_url: '',
      status: 'queued_for_processing',
      review_stages,
      // Clear any error/retry state that might prevent routing
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
      // Ensure updated_at changes even if DB has no trigger
      updated_at: queuedAt,
    };

    await updateOrderRowResilientById(orderRowId, updateData);
    console.log(`[Regenerate 3] ✅ Queued ${amazonOrderId} (id=${orderRowId}) for router at ${queuedAt}`);
    console.log(`[Regenerate 3] Order ${amazonOrderId} queued for router. Router will pick it up on next cron run.`);

    return NextResponse.json({
      success: true,
      orderId,
      message: '3 workflow regeneration queued. Manifests cleared. Router will pick up this order on next cron run.',
      manifestCleared: manifest3Modified
    });
  } catch (error: any) {
    console.error('[Regenerate 3] Error:', error);
    console.error('[Regenerate 3] Error stack:', error?.stack);
    console.error('[Regenerate 3] Error details:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 3 workflow',
        details: error?.message || 'Unknown error',
        code: error?.code,
        hint: error?.hint
      },
      { status: 500 }
    );
  }
}
