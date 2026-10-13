import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';
const RequestSchema = z.object({
  submissionId: z.string().uuid(),
  claimToken: z.string().uuid(),
}).strict();

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid print routing fence request' }, { status: 400 });

  const rpc = supabase.rpc as unknown as (
    name: string,
    args: { p_submission_id: string; p_token: string },
  ) => Promise<{ error: unknown }>;
  const { error } = await rpc('fence_gelato_print_submission', {
    p_submission_id: parsed.data.submissionId,
    p_token: parsed.data.claimToken,
  });
  if (error) return NextResponse.json({ error: 'Print claim could not be fenced' }, { status: 409 });
  return NextResponse.json({ success: true, fenced: true });
}
