import { matchesGelatoSecret } from '@/lib/books/gelato-webhook';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const expected = process.env.CRON_SECRET;
  const bearer = request.headers.get('authorization');
  if (!matchesGelatoSecret(bearer?.startsWith('Bearer ') ? bearer.slice(7) : null, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  if (process.env.GELATO_SCHEDULED_STATUS_ENABLED !== 'true') {
    return Response.json({ disabled: true, checked: 0, delivered: 0, customerMessages: false }, { headers });
  }
  try {
    const [{ pollRegisteredGelatoStatus }, { supabase }] = await Promise.all([
      import('@/lib/books/gelato-scheduled-status'), import('@/lib/supabase-client'),
    ]);
    const result = await pollRegisteredGelatoStatus(supabase);
    return Response.json({ ...result, requiresReview: result.needsAttention > 0, customerMessages: false }, { status: result.errors ? 503 : 200, headers });
  } catch {
    return Response.json({ error: 'Gelato scheduled status check was not confirmed', customerMessages: false }, { status: 503, headers });
  }
}
