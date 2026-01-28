import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError, createNotFoundError } from '@/lib/error-handler';
import { downloadManifest, buildManifestKey, getCharacterAssets } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

/**
 * Queue order for 3 workflow (Book Assembly) via router
 * POST /api/orders/[orderId]/trigger-book-assembly
 * 
 * This endpoint queues the order for the router system instead of calling
 * the n8n webhook directly, ensuring we respect the 5-execution limit.
 */
async function triggerBookAssembly(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  
  // Optional: allow forcing W3 even if some 2B assets are missing
  let force = false;
  try {
    const body = await request.json().catch(() => ({}));
    force = !!body.force;
  } catch {
    // ignore
  }

  console.log(
    `[POST /api/orders/[orderId]/trigger-book-assembly] Queueing order ${orderId} for 3 workflow via router${force ? ' (force=true)' : ''}`
  );
  
  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  // Queue order for W3 via W1.1 router
  // IMPORTANT: Preserve review_stages when updating to avoid losing approvals
  const { updateOrderStatus } = await import('@/lib/status-service');
  const { getOrderFromSupabase } = await import('@/lib/supabase-client');
  
  try {
    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!currentOrder) {
      throw createNotFoundError(`Order ${orderId} not found`);
    }

    // Best-effort: ensure 2B manifest is consistent with any manually uploaded bg-removed assets.
    // This prevents W3 from missing characters when 2B images exist in R2 but the 2b-manifest.json
    // was never updated (common when assets are uploaded manually outside the workflow).
    try {
      const manifest2bKey = buildManifestKey(orderId, '2b');
      const manifest2b = await downloadManifest(manifest2bKey).catch(() => null);

      if (manifest2b && Array.isArray(manifest2b.entries)) {
        const characterHash: string | null =
          (manifest2b.characterHash as string | null) ||
          (manifest2b.order?.characterHash as string | null) ||
          (currentOrder.character_hash as string | null) ||
          null;

        if (characterHash) {
          // Build map poseNumber -> bg-removed key from R2 inventory
          const assets = await getCharacterAssets(characterHash).catch(() => []);
          const bgRemovedByPose = new Map<number, string>();
          for (const a of assets) {
            if (a.assetType !== 'background-removed') continue;
            const key = String(a.url || '').startsWith('/api/assets/')
              ? String(a.url).replace(/^\/api\/assets\//, '')
              : null;
            if (!key) continue;
            if (!Number.isFinite(Number(a.poseNumber))) continue;
            bgRemovedByPose.set(Number(a.poseNumber), key);
          }

          const missingAfterSync: number[] = [];
          let touched = false;
          const nowIso = new Date().toISOString();

          // Only enforce story poses 1..12 (pose00 is cover/base and is handled separately)
          for (let poseNum = 1; poseNum <= 12; poseNum++) {
            let entry = manifest2b.entries.find((e: any) => Number(e?.poseNumber) === poseNum);
            if (!entry) continue;

            const hasKey = typeof entry.bgRemovedKey === 'string' && entry.bgRemovedKey.length > 0;
            if (hasKey) continue;

            const foundKey = bgRemovedByPose.get(poseNum);
            if (foundKey) {
              entry.bgRemovedKey = foundKey;
              entry.bgRemoved = true;
              entry.bgRemovedStatus = entry.bgRemovedStatus || 'completed';
              entry.processedAt = entry.processedAt || nowIso;
              // URL fields are optional; frontend/W3 can derive via /api/assets
              if (!entry.bgRemovedImageUrl) entry.bgRemovedImageUrl = null;
              touched = true;
            } else {
              missingAfterSync.push(poseNum);
            }
          }

          if (touched) {
            manifest2b.updatedAt = nowIso;
            manifest2b.runStamp = nowIso;
            const updated2bManifestJson = JSON.stringify(manifest2b, null, 2);
            await putObject(R2_ORDERS_BUCKET, manifest2bKey, updated2bManifestJson, 'application/json');
            console.log(
              `[trigger-book-assembly] ✅ Synced 2B manifest bgRemovedKey fields from R2 inventory (characterHash=${characterHash})`
            );
          }

          if (missingAfterSync.length && !force) {
            return NextResponse.json(
              {
                error: 'Cannot queue W3: missing background-removed poses in 2B manifest',
                details:
                  'Some poses are missing bgRemovedKey in 2b-manifest.json and no bg-removed asset was found in R2 inventory for those poseNumbers.',
                orderId,
                missingPoseNumbers: missingAfterSync,
                hint:
                  'Upload/replace the missing bg-removed PNGs in the Background Removal tab, or re-run 2B. You can also retry with { force: true } to queue W3 anyway.',
              },
              { status: 409 }
            );
          }
        }
      }
    } catch (e: any) {
      console.warn(
        `[trigger-book-assembly] Non-fatal: failed to sync 2B manifest from R2 inventory:`,
        e?.message || e
      );
      // Continue to queue W3; W3 has additional fallbacks, but we prefer not to block here.
    }
    
    const updates: any = {
      next_workflow: '3',
      execution_status: 'ready_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null
    };
    
    // Preserve review_stages if they exist (to maintain approvals)
    if (currentOrder.review_stages) {
      updates.review_stages = currentOrder.review_stages;
    }
    
    await updateOrderStatus(orderId, updates);
    console.log(`[POST /api/orders/[orderId]/trigger-book-assembly] ✅ Queued order ${orderId} for W3 via router`);
    
    return NextResponse.json({
      success: true,
      message: 'Order queued for book assembly workflow. Router will process it when capacity is available.',
      orderId,
      next_workflow: '3',
      execution_status: 'ready_for_processing'
    });
  } catch (error: any) {
    console.error(`[POST /api/orders/[orderId]/trigger-book-assembly] Error queueing order:`, error);
    // If it's already a NextResponse (e.g., from createNotFoundError), re-throw it
    if (error instanceof NextResponse) {
      throw error;
    }
    throw new Error(`Failed to queue order for book assembly workflow: ${error?.message || error}`);
  }
}

export const POST = withErrorHandling(triggerBookAssembly);


