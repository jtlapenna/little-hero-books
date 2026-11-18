/** Actual admin revision handler request parity; no generation or storage write. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { readOrderPoseContext } from '../src/lib/books/order-pose-context';
import { regeneratePoseResponse } from '../src/app/api/orders/[orderId]/regenerate-pose/route';

async function main() {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_GEMINI_API_KEY;
  let body: { generationConfig?: { imageConfig?: { aspectRatio?: string; imageSize?: string } } } | undefined;
  let calls = 0;
  process.env.GOOGLE_GEMINI_API_KEY = 'synthetic-no-network';
  globalThis.fetch = async (_url, init) => {
    calls++;
    body = JSON.parse(String(init?.body));
    return Response.json({ error: { message: 'SYNTHETIC_STOP_BEFORE_GENERATION' } }, { status: 400 });
  };
  try {
    const orderId = 'SYNTHETIC-REVISION';
    const bookId = 'book-mvp-simple-adventure';
    const result = await regeneratePoseResponse(new NextRequest('https://fixture.invalid/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, orderPrefix: `${bookId}/orders/${orderId}`, poseNumber: 8,
        revisionPrompt: 'Preserve accepted orientation and painted style', includeBaseCharacter: true }),
    }), { params: Promise.resolve({ orderId }) }, {
      readPoseContext: input => readOrderPoseContext(input, async () => { throw Error('R2 404 Not Found'); }),
      getObject: async (_bucket, key) => key.endsWith('2a-manifest.json')
        ? Response.json({ characterHash: 'fixturehash', entries: [{ poseNumber: 8, posePromptBlock: 'Synthetic pose prompt' }] })
        : new Response(new Uint8Array([137,80,78,71]), { headers: { 'content-type': 'image/png' } }),
    });
    assert.equal(result.status, 400);
    assert.equal(calls, 1, 'Fixture must stop before any generation, persistence or retry');
    assert.equal(body?.generationConfig?.imageConfig?.aspectRatio, '1:1');
    assert.equal(body?.generationConfig?.imageConfig?.imageSize, '2K', 'Admin revision must match W2A image detail');
    const workflow = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json', 'utf8'));
    assert.ok(workflow.nodes.some((node: { parameters: { jsCode?: string } }) => /imageSize:\s*["']2K["']/.test(node.parameters.jsCode ?? '')));
    console.log('Actual admin revision and W2A request resolution agree; zero live calls or writes');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.GOOGLE_GEMINI_API_KEY; else process.env.GOOGLE_GEMINI_API_KEY = originalKey;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
