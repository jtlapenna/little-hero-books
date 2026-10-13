import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { handleGelatoSubmission } from '@/lib/books/gelato-submission-endpoint';
import { gelatoSubmissionRuntime } from '@/lib/books/gelato-submission-runtime';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await handleGelatoSubmission(await request.json().catch(() => null), 'quote', gelatoSubmissionRuntime());
  return NextResponse.json(result.body, { status: result.status });
}
