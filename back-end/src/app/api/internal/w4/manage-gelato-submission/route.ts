import { gelatoLifecycleRuntime } from '@/lib/books/gelato-lifecycle-runtime';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { cancelGelatoSubmission, recoverGelatoSubmission, refreshGelatoSubmission } from '@/lib/books/gelato-lifecycle';

export const dynamic = 'force-dynamic';
const Body = z.object({ submissionId: z.string().uuid(), action: z.enum(['refresh', 'recover', 'cancel']) }).strict();
export async function POST(request: NextRequest) {
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Gelato management request' }, { status: 400 });
  const dependencies = gelatoLifecycleRuntime();
  try {
    const action = parsed.data.action === 'recover' ? recoverGelatoSubmission : parsed.data.action === 'cancel' ? cancelGelatoSubmission : refreshGelatoSubmission;
    return NextResponse.json({ success: true, ...await action(parsed.data.submissionId, dependencies) });
  } catch {
    return NextResponse.json({ error: 'Gelato action was not confirmed; inspect saved submission' }, { status: 409 });
  }
}
