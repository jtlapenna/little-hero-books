import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  inspectW41RecoveryGroup,
  listRecentW41RecoveryCandidates,
  replayW41RecoveryGroup,
} from '@/lib/w41-recovery';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  orderId: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ActionSchema = z.object({
  action: z.enum(['replay']),
  orderId: z.string().trim().min(1),
  waitSeconds: z.coerce.number().int().min(0).max(30).optional(),
});

function buildSummary(
  candidates: Awaited<ReturnType<typeof listRecentW41RecoveryCandidates>>,
) {
  const replayReady = candidates.filter(
    (candidate) => candidate.recommendedAction === 'replay',
  ).length;
  const inspectOnly = candidates.filter(
    (candidate) => candidate.recommendedAction === 'inspect',
  ).length;
  const activeMonitor = candidates.filter(
    (candidate) => candidate.recommendedAction === 'monitor',
  ).length;

  return {
    candidateCount: candidates.length,
    replayReady,
    inspectOnly,
    activeMonitor,
  };
}

export async function GET(request: NextRequest) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const query = QuerySchema.parse({
      orderId: request.nextUrl.searchParams.get('orderId') ?? undefined,
      hours: request.nextUrl.searchParams.get('hours') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    });

    const candidates = await listRecentW41RecoveryCandidates({
      hours: query.hours ?? 72,
      limit: query.limit ?? 25,
      staleMinutes: 30,
    });

    let inspectedOrder = null;
    let inspectionError: string | null = null;
    if (query.orderId) {
      try {
        inspectedOrder = await inspectW41RecoveryGroup(query.orderId, {
          staleMinutes: 30,
          includeWorkflowStatus: true,
        });
      } catch (error) {
        inspectionError =
          error instanceof Error ? error.message : 'Unknown inspection failure';
      }
    }

    return NextResponse.json({
      success: true,
      summary: buildSummary(candidates),
      candidates,
      inspectedOrder,
      inspectionError,
    });
  } catch (error) {
    console.error('[GET /api/admin/w41-recovery] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const payload = ActionSchema.parse(await request.json());
    const before = await inspectW41RecoveryGroup(payload.orderId, {
      staleMinutes: 30,
      includeWorkflowStatus: true,
    });

    const actionResult = await replayW41RecoveryGroup(payload.orderId, {
      waitSeconds: payload.waitSeconds ?? 8,
    });

    const after = await inspectW41RecoveryGroup(payload.orderId, {
      staleMinutes: 30,
      includeWorkflowStatus: true,
    });

    return NextResponse.json({
      success: true,
      action: payload.action,
      before,
      after,
      actionResult,
    });
  } catch (error) {
    console.error('[POST /api/admin/w41-recovery] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 400 },
    );
  }
}
