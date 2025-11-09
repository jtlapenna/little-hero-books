import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { validatePreviewToken } from '@/lib/preview-tokens';
import { updateOrderStatus } from '@/lib/status-service';
import { ReviewStageStatus } from '@/constants/statuses';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
} as const;

const allowedReasons = [
  'name_typo',
  'hairStyle_wrong',
  'hairColor_wrong',
  'skinTone_wrong',
  'pronouns_wrong',
  'animalGuide_wrong',
  'favoriteColor_wrong',
  'clothingStyle_wrong',
  'dedication_fix',
  'hometown_fix',
  'favoriteFood_fix',
  'age_wrong',
  'visual_issue',
  'other'
] as const;

type ReviewStageKey = 'preBria' | 'postBria' | 'postPdf';

const reasonStageMap: Record<(typeof allowedReasons)[number], ReviewStageKey> = {
  name_typo: 'postPdf',
  hairStyle_wrong: 'preBria',
  hairColor_wrong: 'preBria',
  skinTone_wrong: 'preBria',
  pronouns_wrong: 'postPdf',
  animalGuide_wrong: 'preBria',
  favoriteColor_wrong: 'preBria',
  clothingStyle_wrong: 'preBria',
  dedication_fix: 'postPdf',
  hometown_fix: 'postPdf',
  favoriteFood_fix: 'postPdf',
  age_wrong: 'postPdf',
  visual_issue: 'postPdf',
  other: 'postPdf'
};

function buildReviewStage(stage: any) {
  const rawStatus =
    stage?.status ||
    stage?.Status ||
    stage?.reviewStatus ||
    stage?.review_status ||
    stage?.currentStatus ||
    ReviewStageStatus.PENDING;

  let normalized: ReviewStageStatus = ReviewStageStatus.PENDING;
  const normalizedRaw =
    typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'pending';

  switch (normalizedRaw) {
    case 'approved':
      normalized = ReviewStageStatus.APPROVED;
      break;
    case 'in-review':
    case 'in_review':
    case 'in review':
      normalized = ReviewStageStatus.IN_REVIEW;
      break;
    case 'rejected':
      normalized = ReviewStageStatus.REJECTED;
      break;
    default:
      normalized = ReviewStageStatus.PENDING;
      break;
  }

  return {
    status: normalized,
    reviewedAt: stage?.reviewedAt || stage?.reviewed_at || null,
    reviewer: stage?.reviewer || stage?.reviewed_by || null,
    comments: stage?.comments || stage?.notes || null
  };
}

function resetStagesForRevision(
  existingStages: any,
  targetStage: ReviewStageKey
) {
  const normalizedStages = {
    preBria: buildReviewStage(existingStages?.preBria ?? existingStages?.pre_bria),
    postBria: buildReviewStage(existingStages?.postBria ?? existingStages?.post_bria),
    postPdf: buildReviewStage(existingStages?.postPdf ?? existingStages?.post_pdf)
  };

  const stagesToReset: ReviewStageKey[] =
    targetStage === 'preBria'
      ? ['preBria', 'postBria', 'postPdf']
      : targetStage === 'postBria'
      ? ['postBria', 'postPdf']
      : ['postPdf'];

  for (const stageKey of stagesToReset) {
    normalizedStages[stageKey] = {
      ...normalizedStages[stageKey],
      status: ReviewStageStatus.PENDING,
      reviewedAt: null,
      reviewer: null,
      comments: undefined
    };
  }

  return normalizedStages;
}

function resolveStrictMode() {
  const mode = process.env.CUSTOMER_REVIEW_STRICT_MODE;
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function buildContactSchema(strictMode: boolean) {
  const emailSchema = strictMode
    ? z.string().trim().email('Valid email required')
    : z
        .union([
          z.string().trim().email('Valid email required'),
          z.undefined(),
          z.null()
        ])
        .transform((value) => (value === null ? undefined : value));

  return z
    .object({
      orderId: z.string().min(1, 'orderId is required'),
      token: z.string().min(1, 'token is required'),
      email: emailSchema,
      name: z.string().trim().min(1).max(150).optional(),
      reason: z.enum(allowedReasons, { required_error: 'reason is required' }),
      fields: z.any().optional(),
      message: z.string().trim().max(2000).optional(),
      marketingOptIn: z.boolean().optional(),
      amazonOrderId: z.string().optional()
    })
    .transform((payload) => {
      if (!strictMode && payload.email === '') {
        return { ...payload, email: undefined };
      }
      return payload;
    });
}

type ContactPayload = z.infer<ReturnType<typeof buildContactSchema>>;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders
  });
}

export async function POST(request: NextRequest) {
  try {
    const strictMode = resolveStrictMode();
    const contactSchema = buildContactSchema(strictMode);

    const body = await request.json();
    if (!strictMode && body && (body.email === null || body.email === '')) {
      delete body.email;
    }

    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request payload',
          issues: parsed.error.issues
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const payload: ContactPayload = parsed.data;

    // Basic field validation per reason
    const structuredFields =
      payload.fields && typeof payload.fields === 'object'
        ? (payload.fields as Record<string, unknown>)
        : {};

    if (Object.keys(structuredFields).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Structured correction requires at least one field value'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate token and make sure it matches the order
    const tokenValidation = await validatePreviewToken(payload.token);
    if (!tokenValidation.valid || !tokenValidation.orderId) {
      return NextResponse.json(
        {
          success: false,
          error: tokenValidation.error || 'Invalid or expired token'
        },
        { status: 401, headers: corsHeaders }
      );
    }

    if (tokenValidation.orderId !== payload.orderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token does not match order'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Enforce single correction per order
    const { count, error: countError } = await supabase
      .from('customer_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', payload.orderId)
      .eq('revision_requested', true);

    if (countError) {
      if (
        countError.code === 'PGRST205' ||
        countError.code === '42P01' ||
        countError.message?.toLowerCase().includes('could not find the table')
      ) {
        console.warn(
          '[API] customer_contacts table not found when counting corrections; continuing with zero corrections.'
        );
      } else {
        console.error('[API] Error counting existing corrections', countError);
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to verify correction limit'
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    if ((count ?? 0) >= 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'You have already used your correction for this order. Please reply to the email thread for follow-up.'
        },
        { status: 409, headers: corsHeaders }
      );
    }

    const normalizedEmail =
      typeof payload.email === 'string' && payload.email.trim().length > 0
        ? payload.email.trim()
        : null;

    const targetStage = reasonStageMap[payload.reason] ?? 'postPdf';
    const orderRecord = await getOrderFromSupabase(payload.orderId).catch(
      () => null
    );

    const nextReviewStages = resetStagesForRevision(
      orderRecord?.review_stages,
      targetStage
    );

    const newRevisionCount = Math.max(
      (orderRecord?.revision_count ?? 0) + 1,
      (count ?? 0) + 1
    );

    try {
      await updateOrderStatus(payload.orderId, {
        review_stages: nextReviewStages,
        workflow_step: 'customer_revision',
        customer_approval_status: 'revision_requested',
        customer_approval_required: true,
        customer_approval_approved_at: null,
        revision_count: newRevisionCount
      });
    } catch (updateError) {
      console.error(
        '[API] Error updating order review state after correction request',
        updateError
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update order status'
        },
        { status: 500, headers: corsHeaders }
      );
    }

    if (strictMode) {
      const nowIso = new Date().toISOString();
      try {
        await supabase
          .from('preview_tokens')
          .update({ used_at: nowIso })
          .eq('order_id', payload.orderId)
          .is('used_at', null);
      } catch (tokenError) {
        console.error(
          '[API] Failed to invalidate existing preview tokens after correction',
          tokenError
        );
      }
    } else {
      console.info(
        '[API] (dev mode) Skipping preview token invalidation after correction.'
      );
    }

    const insertPayload = {
      order_id: payload.orderId,
      amazon_order_id: payload.amazonOrderId || null,
      token: payload.token,
      email: normalizedEmail,
      name: payload.name || null,
      reason: payload.reason,
      payload: Object.keys(structuredFields).length > 0 ? structuredFields : null,
      message: payload.message || null,
      revision_requested: true,
      revision_count: newRevisionCount,
      marketing_opt_in: payload.marketingOptIn ?? false,
      last_contacted_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('customer_contacts')
      .insert(insertPayload);

    if (error) {
      if (
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        error.message?.toLowerCase().includes('could not find the table')
      ) {
        console.warn(
          '[API] customer_contacts table not found when saving contact; skipping persistence for this environment.'
        );
      } else {
        console.error('[API] Error saving customer contact', error);
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to save contact details'
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        correctionNumber: insertPayload.revision_count
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[API] Unexpected error saving customer contact', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

