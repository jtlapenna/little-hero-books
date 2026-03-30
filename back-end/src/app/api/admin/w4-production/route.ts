import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  inspectW4ProductionOrder,
  listRecentW4ProductionCandidates,
} from '@/lib/w4-production-preflight';
import { issueW4ProductionApprovalToken } from '@/lib/w4-production-approval';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  orderId: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ApprovalRequestSchema = z.object({
  orderId: z.string().trim().min(1),
  ttlMinutes: z.coerce.number().int().min(1).max(120).optional(),
});

function buildSummary(
  candidates: Awaited<ReturnType<typeof listRecentW4ProductionCandidates>>,
) {
  const preflightReady = candidates.filter(
    (candidate) => candidate.recommendedAction === 'preflight',
  ).length;
  const inspectOnly = candidates.filter(
    (candidate) => candidate.recommendedAction === 'inspect',
  ).length;

  return {
    candidateCount: candidates.length,
    preflightReady,
    inspectOnly,
  };
}

export function resolvePreflightAdminBaseUrl(url: string): string {
  return new URL(url).origin;
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

    const candidates = await listRecentW4ProductionCandidates({
      hours: query.hours ?? 24 * 14,
      limit: query.limit ?? 25,
    });

    let inspectedOrder = null;
    let inspectionError: string | null = null;
    if (query.orderId) {
      try {
        inspectedOrder = await inspectW4ProductionOrder(query.orderId, {
          adminBaseUrl: resolvePreflightAdminBaseUrl(request.url),
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
    console.error('[GET /api/admin/w4-production] Error:', error);
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
    const body = ApprovalRequestSchema.parse(await request.json());
    const inspection = await inspectW4ProductionOrder(body.orderId, {
      adminBaseUrl: resolvePreflightAdminBaseUrl(request.url),
    });

    if (!inspection.safeForProductionPilot || !inspection.preflight) {
      return NextResponse.json(
        {
          error: 'Order is not eligible for paid W4 approval',
          inspection,
        },
        { status: 400 },
      );
    }

    const approvedBy = adminAuth.mode === 'same_origin' ? 'same-origin-admin' : 'token-admin';
    const approval = issueW4ProductionApprovalToken({
      orderId: inspection.orderId,
      approvedBy,
      ttlMinutes: body.ttlMinutes,
    });

    return NextResponse.json({
      success: true,
      approval,
      inspection,
    });
  } catch (error) {
    console.error('[POST /api/admin/w4-production] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
