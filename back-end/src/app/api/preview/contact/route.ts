import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { supabase } from '@/lib/supabase-client';
import { validatePreviewToken } from '@/lib/preview-tokens';

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

const contactSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  token: z.string().min(1, 'token is required'),
  email: z.string().email('Valid email required'),
  name: z.string().trim().min(1).max(150).optional(),
  reason: z.enum(allowedReasons, { required_error: 'reason is required' }),
  fields: z.record(z.any()).optional(),
  message: z.string().trim().max(2000).optional(),
  marketingOptIn: z.boolean().optional(),
  amazonOrderId: z.string().optional()
});

type ContactPayload = z.infer<typeof contactSchema>;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
    if (payload.reason !== 'other') {
      if (!payload.fields || Object.keys(payload.fields).length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Structured correction requires at least one field value'
          },
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      if (!payload.message || payload.message.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Please provide a short description for Other corrections'
          },
          { status: 400, headers: corsHeaders }
        );
      }
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
      console.error('[API] Error counting existing corrections', countError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to verify correction limit'
        },
        { status: 500, headers: corsHeaders }
      );
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

    const insertPayload = {
      order_id: payload.orderId,
      amazon_order_id: payload.amazonOrderId || null,
      token: payload.token,
      email: payload.email,
      name: payload.name || null,
      reason: payload.reason,
      payload: payload.fields || null,
      message: payload.message || null,
      revision_requested: true,
      revision_count: (count ?? 0) + 1,
      marketing_opt_in: payload.marketingOptIn ?? false,
      last_contacted_at: new Date().toISOString()
    };

    const { error } = await supabase.from('customer_contacts').insert(insertPayload);

    if (error) {
      console.error('[API] Error saving customer contact', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save contact details'
        },
        { status: 500, headers: corsHeaders }
      );
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

