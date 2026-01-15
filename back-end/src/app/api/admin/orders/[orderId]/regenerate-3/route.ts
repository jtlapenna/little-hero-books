import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

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

    // Clear Supabase fields and trigger workflow
    // IMPORTANT: Must clear any existing processing state to allow router to pick it up
    // Use updateOrderInSupabase directly to avoid calculateOrderStatus overriding execution_status
    // Use empty string for URL fields (Supabase might not accept null for text fields)
    const updateData: any = {
      next_workflow: '3', // Uppercase '3' (router expects uppercase)
      execution_status: 'ready_for_processing', // Router only picks up 'ready_for_processing'
      manifest_3_url: '', // Clear manifest URL - use empty string (Supabase text fields)
      final_book_url: '', // Clear final book URL - use empty string
      final_cover_url: '', // Clear final cover URL - use empty string
      queued_at: new Date().toISOString(),
      started_at: null, // Clear started_at
      current_workflow: null, // Clear current_workflow
      review_stages, // Preserve review stages
      // Clear any error/retry state that might prevent routing
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
    };
    
    console.log(`[Regenerate 3] Updating order ${orderId} with:`, {
      next_workflow: updateData.next_workflow,
      execution_status: updateData.execution_status,
      manifest_3_url: updateData.manifest_3_url,
      final_book_url: updateData.final_book_url,
      final_cover_url: updateData.final_cover_url,
    });
    
    try {
      await updateOrderInSupabase(orderId, updateData);
      console.log(`[Regenerate 3] Successfully updated order ${orderId} - cleared manifest_3_url and set execution_status to ready_for_processing`);
    } catch (updateError: any) {
      console.error(`[Regenerate 3] Error updating order in Supabase:`, updateError);
      console.error(`[Regenerate 3] Update error details:`, {
        message: updateError?.message,
        code: updateError?.code,
        details: updateError?.details,
        hint: updateError?.hint,
      });
      throw new Error(`Failed to update order in Supabase: ${updateError?.message || 'Unknown error'}`);
    }

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
