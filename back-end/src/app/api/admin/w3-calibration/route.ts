import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import { buildW3CalibrationResponse } from '@/lib/w3-calibration';
import { BookCharacterPlacementEntrySchema } from '@/lib/books/types';

export const dynamic = 'force-dynamic';

const RequestSchema = z
  .object({
    sourceType: z.enum(['fixture', 'order']),
    fixtureId: z.string().trim().min(1).nullable().optional(),
    orderId: z.string().trim().min(1).nullable().optional(),
    selectedStoryPageNumber: z.coerce.number().int().positive().nullable().optional(),
    selectedPoseNumber: z.coerce.number().int().positive().nullable().optional(),
    characterPlacementOverrideByStoryPage: z
      .record(z.string(), BookCharacterPlacementEntrySchema)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === 'fixture' && !value.fixtureId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fixtureId'],
        message: 'fixtureId is required when sourceType is fixture',
      });
    }

    if (value.sourceType === 'order' && !value.orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orderId'],
        message: 'orderId is required when sourceType is order',
      });
    }
  });

export async function POST(request: NextRequest) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const body = RequestSchema.parse(rawBody);
    const response = await buildW3CalibrationResponse({
      ...body,
      adminBaseUrl: request.nextUrl.origin,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/admin/w3-calibration] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message || 'Invalid request body',
          issues: error.issues,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
