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

const reasonIssueTypeMap: Record<
  (typeof allowedReasons)[number],
  'image' | 'text' | 'character' | 'other'
> = {
  name_typo: 'text',
  hairStyle_wrong: 'character',
  hairColor_wrong: 'character',
  skinTone_wrong: 'character',
  pronouns_wrong: 'text',
  animalGuide_wrong: 'character',
  favoriteColor_wrong: 'character',
  clothingStyle_wrong: 'character',
  dedication_fix: 'text',
  hometown_fix: 'text',
  favoriteFood_fix: 'text',
  age_wrong: 'text',
  visual_issue: 'image',
  other: 'other'
};

function buildFeedbackDescription(payload: {
  reason: string;
  message: string | null;
  fields: Record<string, unknown>;
  email: string | null;
  name: string | null;
}): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return payload.message || payload.reason || 'customer feedback';
  }
}

function isTableMissingError(error: any, tableName: string) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes(`could not find the table '${tableName}'`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

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
    const {
      count: feedbackCount,
      error: feedbackCountError
    } = await supabase
      .from('customer_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', payload.orderId);

    if (
      feedbackCountError &&
      !isTableMissingError(feedbackCountError, 'customer_feedback')
    ) {
      console.error('[API] Error counting existing corrections', feedbackCountError);
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to verify correction limit'
          },
          { status: 500, headers: corsHeaders }
        );
      }

    const priorCorrections = feedbackCount ?? 0;

    if (strictMode && priorCorrections >= 1) {
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
      priorCorrections + 1
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

    const descriptionPayload = {
      reason: payload.reason,
      message: payload.message || null,
      fields: structuredFields,
      email: normalizedEmail,
      name: payload.name || null
    };

    const feedbackInsert = {
      order_id: payload.orderId,
      page_number: 0,
      issue_type: reasonIssueTypeMap[payload.reason] || 'other',
      description: buildFeedbackDescription(descriptionPayload),
      status: 'pending',
      revision_count: newRevisionCount
    };

    const { error: feedbackInsertError } = await supabase
      .from('customer_feedback')
      .insert(feedbackInsert);

    if (feedbackInsertError) {
      if (isTableMissingError(feedbackInsertError, 'customer_feedback')) {
        console.warn(
          '[API] customer_feedback table not found when saving correction; skipping persistence for this environment.'
        );
      } else {
        console.error('[API] Error saving customer feedback', feedbackInsertError);
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
        correctionNumber: newRevisionCount
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

