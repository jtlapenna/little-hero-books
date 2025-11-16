import { NextRequest, NextResponse } from 'next/server';
import { getOrdersForAnalytics, AnalyticsFilters } from '@/lib/supabase-analytics';
import { isTestOrder, getLastNDays, groupByTimePeriod } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/overview
 * 
 * Returns overview metrics for the analytics dashboard
 * 
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: today)
 * - isTest: 'true' | 'false' | undefined (filter test/production)
 * - bookId: string (filter by book ID)
 * - groupBy: 'day' | 'week' | 'month' (default: 'day')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const isTestParam = searchParams.get('isTest');
    const bookId = searchParams.get('bookId') || undefined;
    const groupBy = (searchParams.get('groupBy') || 'day') as 'day' | 'week' | 'month';

    // Default to last 30 days if not specified
    let startDate: string;
    let endDate: string;
    
    if (startDateParam && endDateParam) {
      // Handle both YYYY-MM-DD and ISO string formats
      const start = new Date(startDateParam);
      const end = new Date(endDateParam);
      end.setHours(23, 59, 59, 999); // Include full end date
      startDate = start.toISOString();
      endDate = end.toISOString();
    } else {
      const { start: defaultStart, end: defaultEnd } = getLastNDays(30);
      startDate = startDateParam 
        ? new Date(startDateParam).toISOString() 
        : defaultStart.toISOString();
      endDate = endDateParam 
        ? (() => {
            const end = new Date(endDateParam);
            end.setHours(23, 59, 59, 999);
            return end.toISOString();
          })()
        : defaultEnd.toISOString();
    }

    // Parse isTest filter
    let isTest: boolean | undefined = undefined;
    if (isTestParam === 'true') isTest = true;
    if (isTestParam === 'false') isTest = false;

    // Build filters
    const filters: AnalyticsFilters = {
      startDate,
      endDate,
      isTest,
      bookId
    };

    // Fetch orders
    const orders = await getOrdersForAnalytics(filters);

    // Calculate metrics
    const totalOrders = orders.length;
    const testOrders = orders.filter(o => isTestOrder(o.amazon_order_id));
    const productionOrders = orders.filter(o => !isTestOrder(o.amazon_order_id));
    const testCount = testOrders.length;
    const productionCount = productionOrders.length;

    // Success/Error rates
    const completedOrders = orders.filter(o => 
      o.execution_status === 'completed' || 
      o.status === 'completed' ||
      o.lulu_status === 'shipped'
    );
    const errorOrders = orders.filter(o => 
      o.execution_status?.includes('error') || 
      o.error_type !== null
    );
    const successRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;
    const errorRate = totalOrders > 0 ? (errorOrders.length / totalOrders) * 100 : 0;

    // Workflow completion statistics
    // Orders that completed poses phase (workflow 2A)
    const completedPosesPhase = orders.filter(o => 
      o.manifest_2a_url !== null ||
      o.workflow_step === '2A-complete' ||
      o.workflow_step === 'ai_generation_completed'
    );

    // Orders that completed background removal phase (workflow 2B)
    const completedBackgroundRemovalPhase = orders.filter(o => 
      o.manifest_2b_url !== null ||
      o.workflow_step === '2B-complete' ||
      o.workflow_step === 'bria_processing_complete'
    );

    // Orders that completed pages phase (workflow 3)
    const completedPagesPhase = orders.filter(o => 
      o.manifest_3_url !== null ||
      o.workflow_step === 'book_assembly_completed'
    );

    // Customer approval statistics
    const customerApprovalOrders = orders.filter(o => 
      o.customer_approval_status !== null &&
      o.customer_approval_status !== undefined
    );
    const customerApprovedWithRevision = orders.filter(o => 
      o.customer_approval_status === 'revision_requested'
    );
    const customerApprovedWithoutRevision = orders.filter(o => 
      o.customer_approval_status === 'approved'
    );

    // Error breakdown by error type
    const errorBreakdown: Record<string, number> = {};
    orders.forEach(order => {
      if (order.error_type) {
        errorBreakdown[order.error_type] = (errorBreakdown[order.error_type] || 0) + 1;
      } else if (order.execution_status?.includes('error')) {
        // If no error_type but execution_status indicates error, categorize as 'unknown'
        errorBreakdown['unknown'] = (errorBreakdown['unknown'] || 0) + 1;
      }
    });

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    orders.forEach(order => {
      const status = order.execution_status || order.status || 'unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    // Time series data (orders over time)
    const timeSeriesData = orders.map(order => ({
      date: new Date(order.created_at),
      orders: 1,
      test: isTestOrder(order.amazon_order_id) ? 1 : 0,
      production: isTestOrder(order.amazon_order_id) ? 0 : 1,
    }));

    // Group by time period
    const grouped = groupByTimePeriod(timeSeriesData, groupBy);
    const timeSeries = Object.entries(grouped)
      .map(([date, items]) => ({
        date,
        orders: items.length,
        test: items.reduce((sum, item) => sum + item.test, 0),
        production: items.reduce((sum, item) => sum + item.production, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      metadata: {
        query: {
          startDate,
          endDate,
          isTest: isTestParam,
          bookId,
          groupBy
        },
        generatedAt: new Date().toISOString(),
        recordCount: totalOrders
      },
      summary: {
        totalOrders,
        testOrders: testCount,
        productionOrders: productionCount,
        successRate: Math.round(successRate * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
        completedOrders: completedOrders.length,
        errorOrders: errorOrders.length,
        // Workflow completion statistics
        completedPosesPhase: completedPosesPhase.length,
        completedBackgroundRemovalPhase: completedBackgroundRemovalPhase.length,
        completedPagesPhase: completedPagesPhase.length,
        // Customer approval statistics
        customerApprovalTotal: customerApprovalOrders.length,
        customerApprovedWithRevision: customerApprovedWithRevision.length,
        customerApprovedWithoutRevision: customerApprovedWithoutRevision.length
      },
      errorBreakdown,
      statusBreakdown,
      timeSeries
    });
  } catch (error: any) {
    console.error('[Analytics Overview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overview analytics', details: error.message },
      { status: 500 }
    );
  }
}

