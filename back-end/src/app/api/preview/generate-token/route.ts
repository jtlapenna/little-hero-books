/**
 * API Route: Generate Preview Token
 * 
 * POST /api/preview/generate-token
 * 
 * Generates a secure preview token for an order when the preview is ready.
 * This is typically called by the workflow-3-complete webhook.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePreviewToken } from '@/lib/preview-tokens';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

    // Verify order exists
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Generate token
    const token = await generatePreviewToken(orderId);

    // Update order status to indicate preview is ready
    await updateOrderInSupabase(orderId, {
      customer_approval_status: 'pending',
      customer_approval_requested_at: new Date().toISOString()
    });

    // Generate preview URL for customer-facing site
    // Determine customer site URL based on environment
    // In production, use littleherolabs.com; in development, use localhost
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const customerSiteUrl = process.env.CUSTOMER_SITE_URL?.replace(/\/+$/, '') || 
      (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');
    const previewUrl = `${customerSiteUrl}/approve/${token}`;

    return NextResponse.json({
      success: true,
      token: token,
      previewUrl: previewUrl,
      expiresIn: '3 days'
    });

  } catch (error: any) {
    console.error('[API] Error generating preview token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate preview token' },
      { status: 500 }
    );
  }
}

