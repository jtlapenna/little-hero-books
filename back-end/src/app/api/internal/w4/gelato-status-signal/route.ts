import { gelatoLifecycleRuntime } from '@/lib/books/gelato-lifecycle-runtime';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { GelatoIdSchema } from '@/lib/books/gelato-provider-snapshot';
import { refreshGelatoStatusSignal } from '@/lib/books/gelato-status-signal';

export const dynamic = 'force-dynamic';
const Signal = z.object({ orderId: GelatoIdSchema }).strict();
export async function POST(request: NextRequest) {
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.GELATO_STATUS_RELAY_ENABLED !== 'true') return NextResponse.json({ error: 'Gelato authenticated status relay is disabled' }, { status: 409 });
  const body = Signal.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid Gelato status signal' }, { status: 400 });
  const { data, error } = await supabase.from('print_provider_submission_orders').select('submission_id').eq('provider', 'gelato').eq('provider_order_id', body.data.orderId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Gelato signal lookup failed' }, { status: 503 });
  if (!data) return NextResponse.json({ accepted: false }, { status: 404 });
  try {
    await refreshGelatoStatusSignal(body.data.orderId,{resolve:async()=>data.submission_id,lifecycle:gelatoLifecycleRuntime()});
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: 'Gelato status refresh requires review' }, { status: 409 });
  }
}
