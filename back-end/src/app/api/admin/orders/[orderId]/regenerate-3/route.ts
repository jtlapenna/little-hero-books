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
 * Clears Supabase: manifest_3_url, final_book_url, final_cover_url
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
    /**
     * Update order row directly (avoid `.single()` update path).
     * `updateOrderInSupabase` uses `.select().single()` which can throw even if the UPDATE applied
     * (e.g. response shape / multiple rows). For admin "regenerate" we want a best-effort, reliable update.
     */
    const parseMissingColumn = (err: any): string | null => {
      const details = String(err?.details || err?.message || '');
      // Example: "Could not find the 'final_cover_url' column of 'orders' in the schema cache"
      const m = details.match(/Could not find the '([^']+)' column/i) || details.match(/'([^']+)'\s+column/i);
      return m?.[1] ? String(m[1]) : null;
    };

    const updateOrderRowResilient = async (amazonOrderId: string, updateData: Record<string, unknown>) => {
      // Copy so we can progressively drop unknown columns based on PostgREST errors.
      const dataToUpdate: Record<string, unknown> = { ...updateData };
      let lastError: any = null;

      for (let i = 0; i < 6; i++) {
        const { data, error } = await supabase
          .from('orders')
          .update(dataToUpdate)
          .eq('amazon_order_id', amazonOrderId)
          .select('id');

        if (!error) {
          if (!data || data.length === 0) throw new Error(`Order not found for update: ${amazonOrderId}`);
          return;
        }

        lastError = error;
        const code = String(error?.code || '');
        const missingCol = (code === 'PGRST204' || code === '42703') ? parseMissingColumn(error) : null;
        if (!missingCol || !(missingCol in dataToUpdate)) throw error;

        // Drop the missing column and retry (supports differing schemas across environments)
        delete dataToUpdate[missingCol];
      }

      throw lastError || new Error('Failed to update order (unknown error)');
    };

    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    if (!currentOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Download 3 manifest if it exists
    const manifest3Key = buildManifestKey(orderId, '3');
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
      final_book_url: '',
      // Some schemas use `cover_image_url` instead of `final_cover_url` (or may not have `final_cover_url`)
      final_cover_url: '',
      cover_image_url: '',
      // Preserve review stages
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

    await updateOrderRowResilient(orderId.trim(), updateData);
    console.log(`[Regenerate 3] ✅ Queued ${orderId} for router at ${queuedAt}`);

    console.log(`[Regenerate 3] Order ${orderId} queued for router. Router will pick it up on next cron run.`);

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
