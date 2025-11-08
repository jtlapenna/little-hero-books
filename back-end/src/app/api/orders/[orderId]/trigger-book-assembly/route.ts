import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

// Minimal helper to parse JSON body safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON in manifest'); }
}

// Build signed/proxied URL via existing backend proxy endpoint
function toAssetProxyUrl(storageKey: string): string {
  const base = process.env.PUBLIC_BACKEND_URL || 'https://admin.littleherolabs.com';
  return `${base}/api/assets/${storageKey}`;
}

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    // Auth: require Bearer token (same as other admin endpoints)
    const auth = req.headers.get('authorization') || '';
    const disableAuth = process.env.ADMIN_DISABLE_AUTH === 'true';
    if (!disableAuth && !auth.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = params.orderId;
    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Fetch 2B manifest from R2
    const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2b-manifest.json`;
    const res = await getObject(R2_ORDERS_BUCKET, manifestKey);
    const manifest = await readJsonSafe<any>(res);

    const { order, entries } = manifest || {};
    const characterHash = manifest?.characterHash || order?.characterHash;
    const amazonOrderId = order?.amazonOrderId || orderId;
    if (!amazonOrderId || !characterHash) {
      return NextResponse.json({ error: 'Manifest missing amazonOrderId or characterHash' }, { status: 400 });
    }

    // Build processedImages list expected by Workflow 3
    // Include all poses with bgRemovedKey (including pose0 if it exists)
    // Note: Images uploaded via backend may have bgRemovedKey even if workflow 2B didn't run
    const processedImages = (entries || [])
      .filter((e: any) => Number.isFinite(Number(e.poseNumber)) && e.bgRemovedKey)
      .sort((a: any, b: any) => a.poseNumber - b.poseNumber)
      .map((e: any) => {
        const fileName = e.bgRemovedKey.split('/').pop() || `pose${String(e.poseNumber).padStart(2,'0')}_nobg.png`;
        return {
          poseNumber: e.poseNumber,
          fileName,
          r2Path: e.bgRemovedKey,
          publicUrl: toAssetProxyUrl(e.bgRemovedKey),
          briaProcessed: true,
          briaStatus: 'COMPLETED',
          processingError: false,
        };
      });

    // Workflow 3 expects at least poses 1-12, but may have more (e.g., pose0)
    const requiredPoses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const presentPoseNumbers = new Set(processedImages.map((pi: any) => Number(pi.poseNumber)));
    const missingRequiredPoses = requiredPoses.filter(p => !presentPoseNumbers.has(p));
    
    if (missingRequiredPoses.length > 0) {
      return NextResponse.json({ 
        error: 'Background-removed images incomplete', 
        count: processedImages.length,
        expected: 12,
        missingPoses: missingRequiredPoses,
        message: `Expected background-removed images for poses 1-12, but missing: ${missingRequiredPoses.join(', ')}`
      }, { status: 400 });
    }

    // Build payload for Workflow 3
    const payload = {
      amazonOrderId,
      characterHash,
      characterSpecs: order?.characterSpecs || {},
      bookSpecs: order?.bookSpecs || {},
      orderDetails: order?.orderDetails || {},
      publicR2Url: order?.publicR2Url || null,
      processedImages,
    };

    // POST to Workflow 3 webhook
    const webhookUrl = process.env.WORKFLOW3_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/book-assembly';
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: 'Webhook call failed', status: resp.status, body: errText }, { status: 502 });
    }

    const json = await resp.json().catch(() => ({}));
    return NextResponse.json({ ok: true, job: json, manifestKey, webhookUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}


