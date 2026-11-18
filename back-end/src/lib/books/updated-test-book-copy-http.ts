import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import { isHumanAdminIdentity } from '@/lib/admin-auth-policy';
import { readBoundedRequestText, RequestBodyError } from '@/lib/request-body';
import { inspectUpdatedTestBookCopy, prepareUpdatedTestBookCopy, UpdatedBookConflict, type UpdatedBookCopyPorts } from '@/lib/books/updated-test-book-copy';
import { updatedTestBookCopyStore } from '@/lib/books/updated-test-book-copy-store';

const Body = z.object({ expectedUpdatedAt: z.string().min(1).max(64), configChecksum: z.string().regex(/^[a-f0-9]{64}$/), dedicationText: z.string().max(200) }).strict();
const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store' };
type Params = { params: Promise<{ orderId: string }> };
interface Dependencies { ports: UpdatedBookCopyPorts; authorize: typeof requireAdminAuth }
const defaults: Dependencies = { ports: updatedTestBookCopyStore, authorize: requireAdminAuth };

/** Shared injected handler keeps HTTP/auth/body tests on the actual preparation service. */
export async function updatedTestCopyResponse(request: Request, context: Params, deps = defaults) {
  const auth = await deps.authorize(request);
  if (!auth.ok) return auth.response;
  if (!isHumanAdminIdentity(auth)) return Response.json({ error: 'Sign in as an administrator to create an updated test book' }, { status: 403, headers });
  const { orderId } = await context.params;
  try {
    if (request.method === 'GET') return Response.json(await inspectUpdatedTestBookCopy(orderId, deps.ports), { headers });
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
    const body = Body.parse(JSON.parse(await readBoundedRequestText(request, 4096, { fatal: true })));
    const result = await prepareUpdatedTestBookCopy({ ...body, sourceOrderId: orderId, actor: auth.actor }, deps.ports);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof UpdatedBookConflict) return Response.json({ error: error.message }, { status: 409, headers });
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: 'Refresh the edition check and enter a dedication of 200 characters or fewer' }, { status: 400, headers });
    return Response.json({ error: 'Preparation could not be confirmed. Retry safely; the original order is unchanged.' }, { status: 503, headers });
  }
}
