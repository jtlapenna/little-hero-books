import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { buildManifestKey, downloadManifest } from '@/lib/r2-service';

const W4_WEBHOOK_URL = 'https://thepeakbeyond.app.n8n.cloud/webhook/w4-pdf-print';

async function sendToPrint(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Invalid order ID provided' },
      { status: 400 }
    );
  }

  let payload: Record<string, unknown> = {};
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      payload = await request.json();
    } catch (error) {
      console.warn('[Workflow4] Failed to parse JSON payload for print trigger', {
        orderId,
        error
      });
    }
  }

  const source =
    typeof payload?.source === 'string' ? String(payload.source) : 'unspecified';

  console.info('[Workflow4] Loading 3-manifest for print workflow', {
    orderId,
    source
  });

  // Load 3-manifest.json from R2
  let manifest3Raw: any;
  try {
    const manifestKey = buildManifestKey(orderId, '3');
    manifest3Raw = await downloadManifest(manifestKey);
    
    // Handle array response (manifest might be wrapped in array)
    let manifest3: any = Array.isArray(manifest3Raw) ? manifest3Raw[0] : manifest3Raw;
    
    // If the unwrapped object has a nested 'manifest' property, use that instead
    // This handles cases where the structure is: [{ manifest: {...}, pagePreviewImages: [...] }]
    if (manifest3?.manifest && typeof manifest3.manifest === 'object') {
      // Merge manifest properties with top-level properties
      manifest3 = {
        ...manifest3.manifest,
        // Preserve top-level properties that might not be in manifest
        pagePreviewImages: manifest3.pagePreviewImages || manifest3.manifest.pagePreviewImages,
        orderId: manifest3.orderId || manifest3.manifest.orderId,
        characterHash: manifest3.characterHash || manifest3.manifest.characterHash,
      };
    }
    
    console.log('[Workflow4] Successfully loaded 3-manifest:', {
      orderId,
      hasPngGeneration: !!manifest3.pngGeneration,
      hasPdfGeneration: !!manifest3.pdfGeneration,
      hasPages: !!manifest3.pages,
      hasPagesWithCloudflare: !!manifest3.pngGeneration?.pagesWithCloudflare,
      pageKeys: manifest3.pngGeneration?.pages ? Object.keys(manifest3.pngGeneration.pages) : [],
      hasP00: !!manifest3.pngGeneration?.pages?.p00,
      hasP00Dedication: !!manifest3.pngGeneration?.pages?.p00_dedication
    });
    
    // Normalize p00_dedication to p00 (W4 requires p00, not p00_dedication)
    // This ensures compatibility with both naming conventions
    if (manifest3.pngGeneration?.pages) {
      const pages = manifest3.pngGeneration.pages;
      const hadP00Before = !!pages.p00;
      const hadP00DedicationBefore = !!pages.p00_dedication;
      
      console.log('[Workflow4] Before normalization:', {
        hasP00: hadP00Before,
        hasP00Dedication: hadP00DedicationBefore,
        p00Value: pages.p00 || null,
        p00DedicationValue: pages.p00_dedication || null
      });
      
      // If p00_dedication exists but p00 doesn't, copy it to p00
      if (pages.p00_dedication && !pages.p00) {
        pages.p00 = pages.p00_dedication;
        console.log('[Workflow4] ✅ Normalized p00_dedication to p00 in pages:', {
          p00Value: pages.p00,
          source: 'p00_dedication'
        });
      } else if (pages.p00 && !pages.p00_dedication) {
        // Also set p00_dedication if only p00 exists (for backward compatibility)
        pages.p00_dedication = pages.p00;
        console.log('[Workflow4] ✅ Set p00_dedication from p00 for backward compatibility');
      } else if (pages.p00 && pages.p00_dedication) {
        console.log('[Workflow4] ✅ Both p00 and p00_dedication already exist');
      } else {
        console.warn('[Workflow4] ⚠️ Neither p00 nor p00_dedication found in pages');
      }
    }
    
    // Also normalize in pagesWithCloudflare if it exists
    if (manifest3.pngGeneration?.pagesWithCloudflare) {
      const pagesWithCloudflare = manifest3.pngGeneration.pagesWithCloudflare;
      const hadP00Before = !!pagesWithCloudflare.p00;
      const hadP00DedicationBefore = !!pagesWithCloudflare.p00_dedication;
      
      console.log('[Workflow4] Before normalization (pagesWithCloudflare):', {
        hasP00: hadP00Before,
        hasP00Dedication: hadP00DedicationBefore
      });
      
      // If p00_dedication exists but p00 doesn't, copy it to p00
      if (pagesWithCloudflare.p00_dedication && !pagesWithCloudflare.p00) {
        pagesWithCloudflare.p00 = pagesWithCloudflare.p00_dedication;
        console.log('[Workflow4] ✅ Normalized p00_dedication to p00 in pagesWithCloudflare');
      } else if (pagesWithCloudflare.p00 && !pagesWithCloudflare.p00_dedication) {
        // Also set p00_dedication if only p00 exists
        pagesWithCloudflare.p00_dedication = pagesWithCloudflare.p00;
        console.log('[Workflow4] ✅ Set p00_dedication from p00 in pagesWithCloudflare');
      } else if (pagesWithCloudflare.p00 && pagesWithCloudflare.p00_dedication) {
        console.log('[Workflow4] ✅ Both p00 and p00_dedication already exist in pagesWithCloudflare');
      }
    }
    
    // Validate critical requirement: p00 must exist
    const finalHasP00 = !!manifest3.pngGeneration?.pages?.p00;
    console.log('[Workflow4] Final validation check:', {
      hasP00: finalHasP00,
      p00Value: manifest3.pngGeneration?.pages?.p00 || null,
      allPageKeys: manifest3.pngGeneration?.pages ? Object.keys(manifest3.pngGeneration.pages) : []
    });
    
    if (!finalHasP00) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing p00 (dedication page) in manifest. p00 is required for print workflow.',
          details: {
            availablePageKeys: manifest3.pngGeneration?.pages ? Object.keys(manifest3.pngGeneration.pages) : [],
            hasP00Dedication: !!manifest3.pngGeneration?.pages?.p00_dedication
          }
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!manifest3.characterHash) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing characterHash in manifest. Cannot send to print.'
        },
        { status: 400 }
      );
    }

    if (!manifest3.pngGeneration?.pages || Object.keys(manifest3.pngGeneration.pages).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing page images in manifest. Cannot send to print.'
        },
        { status: 400 }
      );
    }

    // Send manifest as-is (minimal transformation - W4 will handle URL derivation)
    // Only ensure required top-level fields exist
    // CRITICAL: W4 requires amazonOrderId at the top level
    const resolvedAmazonOrderId = manifest3.amazonOrderId || manifest3.orderId || orderId;
    
    if (!resolvedAmazonOrderId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing amazonOrderId. Cannot determine order ID from manifest or request.',
          details: {
            manifestHasAmazonOrderId: !!manifest3.amazonOrderId,
            manifestHasOrderId: !!manifest3.orderId,
            requestOrderId: orderId
          }
        },
        { status: 400 }
      );
    }
    
    // Extract cover PNG R2 key from manifest
    const coverPngR2Key = manifest3.pngGeneration?.coverSpreadImage || null;
    
    // Backend URL for building asset URLs
    const backendUrl = 'https://admin.littleherolabs.com';
    
    // Build payload - ensure amazonOrderId and orderId are ALWAYS set at top level
    // CRITICAL: Put orderId and amazonOrderId FIRST to ensure they're at the top level
    const w4Payload: any = {
      // CRITICAL: Set orderId and amazonOrderId FIRST (W4 requirement)
      orderId: resolvedAmazonOrderId,
      amazonOrderId: resolvedAmazonOrderId,
      // New cover fields for W4 (top level for easy access)
      coverPngR2Key: coverPngR2Key,
      backendUrl: backendUrl,
      // Then spread the rest of the manifest
      ...manifest3,
      // Override any null/undefined values that might have come from manifest
      orderId: resolvedAmazonOrderId,
      amazonOrderId: resolvedAmazonOrderId,
      // Ensure schema exists (fallback only if missing)
      schema: manifest3.schema || 'lhb.run-manifest@v2.0',
      // Ensure summary.readyForBook exists
      summary: {
        ...(manifest3.summary || {}),
        readyForBook: manifest3.summary?.readyForBook ?? true
      }
    };
    
    // Final defensive check: ensure these fields are never null/undefined/empty
    if (!w4Payload.amazonOrderId || w4Payload.amazonOrderId === '' || w4Payload.amazonOrderId === null || w4Payload.amazonOrderId === undefined) {
      w4Payload.amazonOrderId = resolvedAmazonOrderId;
    }
    if (!w4Payload.orderId || w4Payload.orderId === '' || w4Payload.orderId === null || w4Payload.orderId === undefined) {
      w4Payload.orderId = resolvedAmazonOrderId;
    }
    
    // Final validation: Ensure amazonOrderId is present in payload
    if (!w4Payload.amazonOrderId || w4Payload.amazonOrderId === '') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to set amazonOrderId in payload. This should not happen.',
          details: {
            resolvedAmazonOrderId,
            payloadKeys: Object.keys(w4Payload),
            amazonOrderIdValue: w4Payload.amazonOrderId,
            orderIdValue: w4Payload.orderId
          }
        },
        { status: 500 }
      );
    }

    // Send to W4 webhook
    try {
      console.log('[Workflow4] Sending manifest to W4 webhook:', {
        orderId,
        webhookUrl: W4_WEBHOOK_URL,
        payloadSize: JSON.stringify(w4Payload).length,
        pageCount: Object.keys(w4Payload.pngGeneration.pages).length,
        hasP00: !!w4Payload.pngGeneration.pages.p00,
        hasPagesWithCloudflare: !!w4Payload.pngGeneration.pagesWithCloudflare,
        amazonOrderId: w4Payload.amazonOrderId,
        orderIdInPayload: w4Payload.orderId,
        characterHash: w4Payload.characterHash,
        // Cover fields for W4
        coverPngR2Key: w4Payload.coverPngR2Key,
        backendUrl: w4Payload.backendUrl,
        hasCoverPng: !!w4Payload.coverPngR2Key,
        // Verify amazonOrderId is actually in the payload
        payloadHasAmazonOrderId: 'amazonOrderId' in w4Payload,
        payloadTopLevelKeys: Object.keys(w4Payload).slice(0, 10) // First 10 keys for debugging
      });
      
      // CRITICAL: Final check before sending - ensure amazonOrderId is present
      if (!w4Payload.amazonOrderId || w4Payload.amazonOrderId === '') {
        console.error('[Workflow4] ❌ CRITICAL: amazonOrderId is missing or empty in payload!', {
          resolvedAmazonOrderId,
          payloadAmazonOrderId: w4Payload.amazonOrderId,
          payloadKeys: Object.keys(w4Payload)
        });
        return NextResponse.json(
          { 
            success: false, 
            error: 'amazonOrderId is missing in payload. Cannot send to W4.',
            details: {
              resolvedAmazonOrderId,
              payloadKeys: Object.keys(w4Payload)
            }
          },
          { status: 500 }
        );
      }

      // Log the actual payload structure being sent (first 2000 chars for debugging)
      const payloadString = JSON.stringify(w4Payload);
      console.log('[Workflow4] Payload structure (first 2000 chars):', payloadString.substring(0, 2000));
      console.log('[Workflow4] Payload top-level keys:', Object.keys(w4Payload));
      console.log('[Workflow4] Payload amazonOrderId value:', w4Payload.amazonOrderId);
      console.log('[Workflow4] Payload orderId value:', w4Payload.orderId);
      console.log('[Workflow4] Payload has amazonOrderId key:', 'amazonOrderId' in w4Payload);
      console.log('[Workflow4] Payload has orderId key:', 'orderId' in w4Payload);

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const webhookResponse = await fetch(W4_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Little-Hero-Books-Backend/1.0',
          },
          body: payloadString,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text().catch(() => 'Unknown error');
          console.error('[Workflow4] W4 webhook returned error:', {
            orderId,
            status: webhookResponse.status,
            statusText: webhookResponse.statusText,
            error: errorText,
            headers: Object.fromEntries(webhookResponse.headers.entries())
          });
          
          return NextResponse.json(
            { 
              success: false, 
              error: `W4 webhook returned error: ${webhookResponse.status} ${webhookResponse.statusText}`,
              details: errorText.substring(0, 500)
            },
            { status: webhookResponse.status }
          );
        }

        const webhookResult = await webhookResponse.json().catch(() => ({}));
        
        console.info('[Workflow4] Successfully sent to W4 webhook:', {
          orderId,
          source,
          webhookStatus: webhookResponse.status,
          webhookResponseHeaders: Object.fromEntries(webhookResponse.headers.entries()),
          webhookResult
        });

        return NextResponse.json({
          success: true,
          message: 'Book Successfully Sent to Print Service',
          orderId,
          webhookResponse: webhookResult
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.error('[Workflow4] W4 webhook request timed out after 30 seconds:', {
            orderId,
            webhookUrl: W4_WEBHOOK_URL
          });
          return NextResponse.json(
            { 
              success: false, 
              error: 'Webhook request timed out. The workflow may still be processing.',
              details: 'Request took longer than 30 seconds to respond'
            },
            { status: 504 }
          );
        }
        throw fetchError; // Re-throw to be caught by outer catch
      }
    } catch (webhookError: any) {
      // Handle webhook network errors separately from manifest loading errors
      console.error('[Workflow4] Failed to send to W4 webhook:', {
        orderId,
        error: webhookError?.message || webhookError,
        stack: webhookError?.stack,
        webhookUrl: W4_WEBHOOK_URL,
        errorName: webhookError?.name,
        errorCode: webhookError?.code
      });
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to send to print service',
          details: webhookError?.message || 'Network error or webhook unavailable'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    // This catch handles manifest loading errors
    console.error('[Workflow4] Failed to load 3-manifest:', {
      orderId,
      error: error?.message || error
    });
    return NextResponse.json(
      { 
        success: false, 
        error: '3-manifest.json not found. Workflow 3 (Book Assembly) must complete before sending to print.',
        details: error?.message || 'Manifest not found'
      },
      { status: 404 }
    );
  }
}

export const POST = withErrorHandling(sendToPrint);

