import { authorizePrinterFileRequest } from './printer-file-grants';
import { requireAdminAuth } from './admin-auth';
import { verifyPreviewImageGrant } from './preview-file-grants';

export async function requirePrivateFileAuth(request: Request, key: string, kind: 'manifest' | 'asset' | 'pdf'): Promise<{ ok: true } | { ok: false; response: Response }> {
  const url = new URL(request.url);
  if (kind === 'pdf' && url.searchParams.has('printerGrant')) {
    return await authorizePrinterFileRequest(request, key) ? { ok: true } : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } }) };
  }
  const grants = url.searchParams.getAll('previewGrant');
  if (kind === 'asset' && grants.length) {
    if (grants.length === 1 && await verifyPreviewImageGrant(grants[0], key)) return { ok: true };
    return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*' } }) };
  }
  const auth = await requireAdminAuth(request);
  if (auth.ok) return { ok: true };
  auth.response.headers.set('Access-Control-Allow-Origin', '*');
  return auth;
}
