import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/regenerate-2b
 * 
 * Force regeneration of 2B workflow by clearing status fields and triggering workflow.
 * 
 * Clears from 2A manifest entries (source):
 * - briaStatusUrl, briaRequestId
 * 
 * Clears from 2B manifest entries (if exists):
 * - bgRemovedKey, bgRemovedImageUrl
 * - briaStatus, briaRequestId, briaStatusUrl
 * - sourceApprovedKey, sourceReplacedAt, sourceReplacementCount
 * - needsReview, reviewReason, isFlagged (cleared to false/null to start fresh)
 * 
 * Queues order for router (w1.1) to pick up and route to 2B workflow
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // PSEUDOCODE
  // - Load the existing order (by any identifier) so we can update by primary key (id)
  // - Clear 2A/2B manifest per-entry Bria fields (best-effort)
  // - Queue the order back to router for 2B by updating the same DB row (never insert / never reset workflow_step)

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
    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    if (!currentOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Download 2A manifest (source)
    const manifest2aKey = buildManifestKey(orderId, '2a');
    let manifest2a: any = null;
    let manifest2aModified = false;
    try {
      manifest2a = await downloadManifest(manifest2aKey);
      
      // Clear Bria status fields from 2A manifest entries
      if (manifest2a && Array.isArray(manifest2a.entries)) {
        manifest2a.entries.forEach((entry: any) => {
          if (entry.briaStatusUrl || entry.briaRequestId) {
            delete entry.briaStatusUrl;
            delete entry.briaRequestId;
            manifest2aModified = true;
          }
        });
      }
    } catch (error: any) {
      console.log(`[Regenerate 2B] 2A manifest not found: ${manifest2aKey}`);
    }

    // Download 2B manifest if it exists
    const manifest2bKey = buildManifestKey(orderId, '2b');
    let manifest2b: any = null;
    let manifest2bModified = false;
    try {
      manifest2b = await downloadManifest(manifest2bKey);
      
      // Clear status fields from 2B manifest entries
      if (manifest2b && Array.isArray(manifest2b.entries)) {
        manifest2b.entries.forEach((entry: any) => {
          let entryModified = false;
          if (entry.bgRemovedKey || entry.bgRemovedImageUrl) {
            delete entry.bgRemovedKey;
            delete entry.bgRemovedImageUrl;
            entryModified = true;
          }
          if (entry.briaStatus || entry.briaRequestId || entry.briaStatusUrl) {
            delete entry.briaStatus;
            delete entry.briaRequestId;
            delete entry.briaStatusUrl;
            entryModified = true;
          }
          if (entry.sourceApprovedKey || entry.sourceReplacedAt || entry.sourceReplacementCount) {
            delete entry.sourceApprovedKey;
            delete entry.sourceReplacedAt;
            delete entry.sourceReplacementCount;
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
            manifest2bModified = true;
          }
        });
      }
    } catch (error: any) {
      console.log(`[Regenerate 2B] 2B manifest not found: ${manifest2bKey}`);
    }

    // Upload modified manifests if changes were made
    if (manifest2aModified && manifest2a) {
      const manifestJson = JSON.stringify(manifest2a, null, 2);
      await putObject(
        R2_ORDERS_BUCKET,
        manifest2aKey,
        manifestJson,
        'application/json'
      );
      console.log(`[Regenerate 2B] Cleared Bria status fields in 2A manifest: ${manifest2aKey}`);
    }

    if (manifest2bModified && manifest2b) {
      const manifestJson = JSON.stringify(manifest2b, null, 2);
      await putObject(
        R2_ORDERS_BUCKET,
        manifest2bKey,
        manifestJson,
        'application/json'
      );
      console.log(`[Regenerate 2B] Cleared status fields in 2B manifest: ${manifest2bKey}`);
    }

    // Preserve review_stages exactly as-is. Regenerate should only queue routing fields.
    // (Do not auto-approve/reset stages here; that can be process-breaking.)
    const review_stages: any = currentOrder.review_stages || {};

    // Queue order for router (w1.1) to pick up and route to 2B.
    // IMPORTANT:
    // - Update by primary key `id` to avoid trailing-space / identifier mismatches.
    // - Do NOT use updateOrderStatus helper here; it can recalculate status and/or trigger fragile update paths.
    const queuedAt = new Date().toISOString();
    const orderRowId = Number(currentOrder.id);
    if (!Number.isFinite(orderRowId)) {
      return NextResponse.json(
        { error: 'Order row is missing numeric id (cannot queue regenerate safely)' },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        next_workflow: '2B', // Uppercase '2B' (router expects uppercase)
        execution_status: 'ready_for_processing', // Router only picks up 'ready_for_processing'
        queued_at: queuedAt,
        started_at: null,
        current_workflow: null,
        review_stages, // Preserve as-is (JSONB)
        // Clear any error/retry state that might prevent routing
        error_message: null,
        error_type: null,
        retry_count: 0,
        last_error_at: null,
        next_retry_at: null,
        updated_at: queuedAt,
      })
      .eq('id', orderRowId)
      .select('id');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to queue order for 2B regeneration', details: error.message, code: error.code, hint: error.hint },
        { status: 500 }
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Order not found for update (no rows affected)' },
        { status: 404 }
      );
    }

    console.log(`[Regenerate 2B] Order ${orderId} queued for router. Router will pick it up on next cron run.`);

    return NextResponse.json({
      success: true,
      orderId,
      message: '2B workflow regeneration queued. Manifests cleared. Router will pick up this order on next cron run.',
      manifest2aCleared: manifest2aModified,
      manifest2bCleared: manifest2bModified
    });
  } catch (error: any) {
    console.error('[Regenerate 2B] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 2B workflow',
        details: error?.message 
      },
      { status: 500 }
    );
  }
}
