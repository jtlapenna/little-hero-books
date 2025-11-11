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
      hasPagesWithCloudflare: !!manifest3.pngGeneration?.pagesWithCloudflare
    });
    
    // Transform manifest to W4 format
    // The manifest should already be in the correct format, but we'll ensure it has required fields
    const w4Payload = {
      schema: manifest3.schema || 'lhb.run-manifest@v2.0',
      runStamp: manifest3.runStamp || manifest3.generatedAt || new Date().toISOString(),
      characterHash: manifest3.characterHash || '',
      amazonOrderId: manifest3.amazonOrderId || manifest3.orderId || orderId,
      pngGeneration: manifest3.pngGeneration || {},
      pdfGeneration: manifest3.pdfGeneration || {},
      assetsUsed: manifest3.assetsUsed || {},
      pages: manifest3.pages || {},
      summary: manifest3.summary || {
        percentComplete: 100,
        readyForBook: true,
        needsHumanReview: false
      },
      generatedAt: manifest3.generatedAt || manifest3.runStamp || new Date().toISOString()
    };

    // Validate required fields
    if (!w4Payload.characterHash) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing characterHash in manifest. Cannot send to print.'
        },
        { status: 400 }
      );
    }

    if (!w4Payload.pngGeneration?.pages || Object.keys(w4Payload.pngGeneration.pages).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing page images in manifest. Cannot send to print.'
        },
        { status: 400 }
      );
    }

    // Send to W4 webhook
    try {
      console.log('[Workflow4] Sending manifest to W4 webhook:', {
        orderId,
        webhookUrl: W4_WEBHOOK_URL,
        payloadSize: JSON.stringify(w4Payload).length,
        pageCount: Object.keys(w4Payload.pngGeneration.pages).length
      });

      const webhookResponse = await fetch(W4_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(w4Payload),
      });

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text().catch(() => 'Unknown error');
        console.error('[Workflow4] W4 webhook returned error:', {
          orderId,
          status: webhookResponse.status,
          statusText: webhookResponse.statusText,
          error: errorText
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
        webhookStatus: webhookResponse.status
      });

      return NextResponse.json({
        success: true,
        message: 'Book Successfully Sent to Print Service',
        orderId,
        webhookResponse: webhookResult
      });
    } catch (webhookError: any) {
      // Handle webhook network errors separately from manifest loading errors
      console.error('[Workflow4] Failed to send to W4 webhook:', {
        orderId,
        error: webhookError?.message || webhookError,
        stack: webhookError?.stack
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

