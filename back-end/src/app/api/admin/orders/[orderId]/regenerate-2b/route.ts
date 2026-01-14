import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { updateOrderStatus } from '@/lib/status-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';

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
 * 
 * Triggers workflow with force=true
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

    // Preserve review_stages when updating
    const review_stages = currentOrder.review_stages || {};

    // For force regeneration, call n8n webhook directly with force=true (bypass router)
    const n8n2BWebhookUrl = process.env.N8N_2B_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal';
    
    try {
      const webhookResponse = await fetch(n8n2BWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          characterHash: currentOrder.character_hash || undefined,
          force: true, // Force regeneration
        }),
      });

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        console.error(`[Regenerate 2B] n8n webhook failed:`, {
          status: webhookResponse.status,
          error: errorText.substring(0, 500),
        });
        // Continue anyway - we've cleared the manifests
      } else {
        console.log(`[Regenerate 2B] Successfully called n8n webhook with force=true`);
      }
    } catch (webhookError: any) {
      console.error(`[Regenerate 2B] Error calling n8n webhook:`, webhookError?.message);
      // Continue anyway - we've cleared the manifests, router can pick it up
    }

    // Also update order status in case webhook call failed (router can pick it up)
    await updateOrderStatus(orderId, {
      next_workflow: '2B',
      execution_status: 'ready_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null,
      review_stages, // Preserve review stages
    });

    return NextResponse.json({
      success: true,
      orderId,
      message: '2B workflow regeneration triggered with force=true. Manifests cleared and webhook called.',
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
