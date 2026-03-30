import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  inspectW41ProductionGroup,
  listRecentW41ProductionCandidates,
} from '@/lib/w41-production-preflight';
import { issueW41ProductionApprovalToken } from '@/lib/w41-production-approval';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  rootGroupId: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ApprovalRequestSchema = z.object({
  rootGroupId: z.string().trim().min(1),
  ttlMinutes: z.coerce.number().int().min(1).max(120).optional(),
});

function buildSummary(
  candidates: Awaited<ReturnType<typeof listRecentW41ProductionCandidates>>,
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
      rootGroupId: request.nextUrl.searchParams.get('rootGroupId') ?? undefined,
      hours: request.nextUrl.searchParams.get('hours') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    });

    const candidates = await listRecentW41ProductionCandidates({
      hours: query.hours ?? 24 * 14,
      limit: query.limit ?? 25,
    });

    let inspectedGroup = null;
    let inspectionError: string | null = null;
    if (query.rootGroupId) {
      try {
        inspectedGroup = await inspectW41ProductionGroup(query.rootGroupId, {
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
      inspectedGroup,
      inspectionError,
    });
  } catch (error) {
    console.error('[GET /api/admin/w41-production] Error:', error);
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
    const inspection = await inspectW41ProductionGroup(body.rootGroupId, {
      adminBaseUrl: resolvePreflightAdminBaseUrl(request.url),
    });

    if (!inspection.safeForProductionPilot || !inspection.preflight) {
      return NextResponse.json(
        {
          error: 'Sibling group is not eligible for paid W4.1 approval',
          inspection,
        },
        { status: 400 },
      );
    }

    const approvedBy = adminAuth.mode === 'same_origin' ? 'same-origin-admin' : 'token-admin';
    const approval = issueW41ProductionApprovalToken({
      rootGroupId: inspection.rootGroupId,
      approvedBy,
      ttlMinutes: body.ttlMinutes,
    });

    return NextResponse.json({
      success: true,
      approval,
      inspection,
    });
  } catch (error) {
    console.error('[POST /api/admin/w41-production] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
