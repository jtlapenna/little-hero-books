import { requireAdminAuth } from '@/lib/admin-auth';
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request, { protectReadActions: true });
  if (!auth.ok) return auth.response;
  return Response.json({ authenticated: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
