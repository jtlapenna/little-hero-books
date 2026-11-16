import { NextRequest, NextResponse } from 'next/server';
import { readBoundedRequestText, RequestBodyError } from '@/lib/request-body';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { recordW2AExecutionFailure } from '@/lib/w2a-failure-recovery';

export const dynamic = 'force-dynamic';
const Body = z.object({ executionId: z.string().regex(/^\d{1,30}$/) }).strict();
export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const text = await readBoundedRequestText(request, 1024);
    const body = Body.parse(JSON.parse(text));
    return NextResponse.json({ success: true, ...await recordW2AExecutionFailure(body.executionId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'W2A failure could not be verified' }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
}
