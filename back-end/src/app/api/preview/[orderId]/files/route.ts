import { authorizePreviewOrder, previewOrderPrefix, privatePreviewHeaders } from '@/lib/customer-preview-access';
import { buildCustomerPreviewFiles } from '@/lib/customer-preview-files';
import { downloadManifest } from '@/lib/r2-service';

export const dynamic = 'force-dynamic';
export async function OPTIONS() { return new Response(null, { status: 204, headers: privatePreviewHeaders }); }

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const body: unknown = await request.json().catch(() => null);
    const token = body && typeof body === 'object' && 'token' in body ? body.token : undefined;
    const access = await authorizePreviewOrder(token, orderId);
    if (!access.ok) return access.response;
    const prefix = previewOrderPrefix(access);
    const manifest = await downloadManifest(`${prefix}/manifests/3-manifest.json`);
    const files = await buildCustomerPreviewFiles(manifest, prefix, access.validation.expiresAt!);
    return Response.json(files, { headers: privatePreviewHeaders });
  } catch {
    // Avoid returning/logging raw manifest content, URLs, grants or provider errors.
    return Response.json({ error: 'Preview files unavailable' }, { status: 404, headers: privatePreviewHeaders });
  }
}
