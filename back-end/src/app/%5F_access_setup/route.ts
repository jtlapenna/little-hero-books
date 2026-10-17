import { requireAdminAuth } from '@/lib/admin-auth';
import { adminReturnPath, canonicalAdminOrigin } from '@/lib/admin-login-target';

export async function GET(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const auth = await requireAdminAuth(request);
  const origin = canonicalAdminOrigin();
  if (!auth.ok) return auth.response;
  if (auth.mode !== 'access' || !origin || new URL(request.url).origin !== origin) {
    return Response.json({ error: 'Human sign-in required' }, { status: 403, headers });
  }
  const query = new URL(request.url).searchParams;
  const targets = query.getAll('returnTo');
  const target = adminReturnPath(targets.length ? targets[0] : '/');
  if (targets.length > 1 || [...query.keys()].some((key) => key !== 'returnTo') || !target) {
    return Response.json({ error: 'Invalid return destination' }, { status: 400, headers });
  }
  return new Response(null, { status: 303, headers: { ...headers, Location: new URL(target, origin).href } });
}
