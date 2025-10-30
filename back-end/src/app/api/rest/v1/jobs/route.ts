import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';

// Minimal schema to accept job creation from n8n
const JobSchema = z.object({
  job_id: z.string().min(1),
  character_hash: z.string().min(1),
  stage: z.string().min(1),
  status: z.string().min(1),
  poses_bg: z.any().optional(),
  qa: z.any().optional(),
  order_data: z.any().optional(),
});

export async function POST(request: NextRequest) {
  // Bearer token check
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const job = JobSchema.parse(json);

    console.log('REST /jobs received:', {
      job_id: job.job_id,
      character_hash: job.character_hash,
      stage: job.stage,
      status: job.status,
    });

    // TODO: integrate with Supabase jobs table later
    return NextResponse.json({ ok: true, received: job }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Invalid payload' }, { status: 400 });
  }
}


