import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { cleanupStuckOrders } from '@/lib/stuck-order-cleanup';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/cleanup-stuck-orders
 * 
 * Manually trigger cleanup of stuck processing orders.
 * Requires admin authentication.
 * 
 * Query params:
 * - timeoutMinutes: Number of minutes before order is considered stuck (default: 30)
 */
export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const timeoutMinutes = parseInt(searchParams.get('timeoutMinutes') || '30', 10);

    if (isNaN(timeoutMinutes) || timeoutMinutes < 1) {
      return NextResponse.json(
        { error: 'timeoutMinutes must be a positive number' },
        { status: 400 }
      );
    }

    const result = await cleanupStuckOrders(timeoutMinutes);

    return NextResponse.json({
      success: true,
      result,
      message: `Cleanup completed: ${result.resetCount} orders reset, ${result.errors.length} errors`
    });
  } catch (error: any) {
    console.error('[cleanup-stuck-orders] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/cleanup-stuck-orders
 * 
 * Get summary of stuck orders without cleaning them up.
 */
export async function GET(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    // This would call getStuckOrdersSummary() when implemented
    return NextResponse.json({
      message: 'Summary endpoint - implementation pending',
      note: 'Use POST to trigger cleanup'
    });
  } catch (error: any) {
    console.error('[cleanup-stuck-orders] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

