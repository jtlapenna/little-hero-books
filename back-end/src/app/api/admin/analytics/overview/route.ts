import { NextRequest, NextResponse } from 'next/server';

import { getLastNDays, groupByTimePeriod, isProductionOrder, isTestOrder } from '@/lib/analytics-helpers';
import { AnalyticsFilters, AnalyticsReportingRecord, getOrdersForAnalytics } from '@/lib/supabase-analytics';

export const dynamic = 'force-dynamic';

type TimeSeriesPoint = {
  date: string;
  orders: number;
  test: number;
  production: number;
  amazon: number;
  d2c: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasLuluActivity(order: AnalyticsReportingRecord): boolean {
  return Boolean(
    order.lulu_job_id ||
      order.lulu_status ||
      order.print_submitted_at ||
      order.shipped_at ||
      order.delivered_at
  );
}

function isDelivered(order: AnalyticsReportingRecord): boolean {
  const status = String(order.lulu_status || '').toLowerCase();
  return Boolean(order.delivered_at || status === 'delivered');
}

function isShipped(order: AnalyticsReportingRecord): boolean {
  const status = String(order.lulu_status || '').toLowerCase();
  return Boolean(order.shipped_at || isDelivered(order) || status === 'shipped');
}

function isFulfillmentException(order: AnalyticsReportingRecord): boolean {
  const status = String(order.lulu_status || '').toLowerCase();
  return ['canceled', 'cancelled', 'failed', 'error', 'rejected'].includes(status);
}

function isCompletedOrder(order: AnalyticsReportingRecord): boolean {
  return Boolean(
    order.execution_status === 'completed' ||
      order.status === 'completed' ||
      isShipped(order)
  );
}

function isActiveLiveOrder(order: AnalyticsReportingRecord): boolean {
  return order.source_presence !== 'archived' && !isCompletedOrder(order);
}

function hasAwaitingApproval(order: AnalyticsReportingRecord): boolean {
  if (order.customer_approval_status === 'revision_requested') {
    return false;
  }

  return Boolean(
    order.customer_approval_status === 'pending' ||
      (order.customer_approval_requested_at && !order.customer_approval_approved_at)
  );
}

function isInPrint(order: AnalyticsReportingRecord): boolean {
  return hasLuluActivity(order) && !isShipped(order) && !isFulfillmentException(order);
}

function needsAttention(order: AnalyticsReportingRecord): boolean {
  return Boolean(
    order.error_type ||
      order.execution_status?.includes('error') ||
      isFulfillmentException(order) ||
      (order.retry_count ?? 0) > 0 ||
      (order.regeneration_attempt ?? 0) > 0
  );
}

function hasReachedPoses(order: AnalyticsReportingRecord): boolean {
  return Boolean(
    order.manifest_2a_url ||
      ['2A-complete', 'ai_generation_completed'].includes(order.workflow_step || '') ||
      ['w2a', 'w2b', 'w3', 'w4'].some((value) =>
        String(order.current_workflow || '').toLowerCase().includes(value)
      ) ||
      hasLuluActivity(order)
  );
}

function hasReachedBackgroundRemoval(order: AnalyticsReportingRecord): boolean {
  return Boolean(
    order.manifest_2b_url ||
      ['2B-complete', 'bria_processing_complete'].includes(order.workflow_step || '') ||
      ['w2b', 'w3', 'w4'].some((value) =>
        String(order.current_workflow || '').toLowerCase().includes(value)
      ) ||
      hasLuluActivity(order)
  );
}

function hasReachedPages(order: AnalyticsReportingRecord): boolean {
  return Boolean(
    order.manifest_3_url ||
      order.workflow_step === 'book_assembly_completed' ||
      ['w3', 'w4'].some((value) => String(order.current_workflow || '').toLowerCase().includes(value)) ||
      hasLuluActivity(order)
  );
}

function countDistinctCustomerOrders(orders: AnalyticsReportingRecord[]): number {
  return new Set(
    orders.map((order) => order.canonical_group_key || order.dedupe_key)
  ).size;
}

function buildSiblingSummary(orders: AnalyticsReportingRecord[]) {
  const byGroup = new Map<string, AnalyticsReportingRecord[]>();

  orders.forEach((order) => {
    const groupKey = order.canonical_group_key;
    if (!groupKey) return;
    const existing = byGroup.get(groupKey) || [];
    existing.push(order);
    byGroup.set(groupKey, existing);
  });

  const multiItemGroups = Array.from(byGroup.values()).filter((group) => group.length > 1);
  const multiItemBookCount = multiItemGroups.reduce((sum, group) => sum + group.length, 0);
  const splitLifecycleRoots = multiItemGroups.filter((group) => {
    const states = new Set(group.map((order) => order.lifecycle_status || 'unknown'));
    return states.size > 1;
  }).length;
  const largestMultiItemOrderSize = multiItemGroups.reduce((max, group) => Math.max(max, group.length), 0);

  return {
    siblingRows: multiItemBookCount,
    multiItemBookCount,
    multiItemOrderCount: multiItemGroups.length,
    singleItemOrderCount: Array.from(byGroup.values()).filter((group) => group.length === 1).length,
    averageBooksPerMultiItemOrder:
      multiItemGroups.length > 0 ? Math.round((multiItemBookCount / multiItemGroups.length) * 100) / 100 : 0,
    largestMultiItemOrderSize,
    splitLifecycleRoots,
    uniqueRootOrders: byGroup.size,
  };
}

function buildTimeSeries(
  orders: AnalyticsReportingRecord[],
  groupBy: 'day' | 'week' | 'month'
): TimeSeriesPoint[] {
  const baseData = orders
    .filter((order) => order.created_at)
    .map((order) => ({
      date: new Date(order.created_at as string),
      orders: 1,
      test: isTestOrder(order) ? 1 : 0,
      production: isProductionOrder(order) ? 1 : 0,
      amazon: order.platform === 'amazon' ? 1 : 0,
      d2c: order.platform === 'd2c' ? 1 : 0,
    }));

  const grouped = groupByTimePeriod(baseData, groupBy);

  return Object.entries(grouped)
    .map(([date, items]) => ({
      date,
      orders: items.length,
      test: items.reduce((sum, item) => sum + Number(item.test || 0), 0),
      production: items.reduce((sum, item) => sum + Number(item.production || 0), 0),
      amazon: items.reduce((sum, item) => sum + Number(item.amazon || 0), 0),
      d2c: items.reduce((sum, item) => sum + Number(item.d2c || 0), 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const isTestParam = searchParams.get('isTest');
    const bookId = searchParams.get('bookId') || undefined;
    const historyScope = (searchParams.get('historyScope') || 'all') as AnalyticsFilters['historyScope'];
    const groupBy = (searchParams.get('groupBy') || 'day') as 'day' | 'week' | 'month';

    let startDate: string;
    let endDate: string;

    if (startDateParam && endDateParam) {
      const start = new Date(startDateParam);
      const end = new Date(endDateParam);
      end.setHours(23, 59, 59, 999);
      startDate = start.toISOString();
      endDate = end.toISOString();
    } else {
      const { start: defaultStart, end: defaultEnd } = getLastNDays(30);
      startDate = startDateParam ? new Date(startDateParam).toISOString() : defaultStart.toISOString();
      endDate = endDateParam
        ? (() => {
            const end = new Date(endDateParam);
            end.setHours(23, 59, 59, 999);
            return end.toISOString();
          })()
        : defaultEnd.toISOString();
    }

    let isTest: boolean | undefined;
    if (isTestParam === 'true') isTest = true;
    if (isTestParam === 'false') isTest = false;

    const filters: AnalyticsFilters = { startDate, endDate, isTest, bookId, historyScope };
    const orders = await getOrdersForAnalytics(filters);

    const totalOrders = orders.length;
    const productionOrders = orders.filter((order) => isProductionOrder(order));
    const testOrders = orders.filter((order) => isTestOrder(order));
    const unknownOrders = orders.filter((order) => order.classification === 'unknown');
    const activeLiveOrders = orders.filter((order) => isActiveLiveOrder(order));
    const awaitingApproval = orders.filter((order) => hasAwaitingApproval(order));
    const inPrint = orders.filter((order) => isInPrint(order));
    const shippedDelivered = orders.filter((order) => isShipped(order));
    const attentionOrders = orders.filter((order) => needsAttention(order));
    const fulfillmentExceptions = orders.filter((order) => isFulfillmentException(order));
    const retryingOrders = orders.filter(
      (order) => (order.retry_count ?? 0) > 0 || (order.regeneration_attempt ?? 0) > 0
    );

    const errorBreakdown: Record<string, number> = {};
    orders.forEach((order) => {
      if (order.error_type) {
        errorBreakdown[order.error_type] = (errorBreakdown[order.error_type] || 0) + 1;
      } else if (order.execution_status?.includes('error')) {
        errorBreakdown.unknown = (errorBreakdown.unknown || 0) + 1;
      }
    });

    const topErrors = Object.entries(errorBreakdown)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const statusBreakdown: Record<string, number> = {};
    orders.forEach((order) => {
      const status = order.execution_status || order.status || 'unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    const siblingSummary = buildSiblingSummary(orders);
    const productionSiblingSummary = buildSiblingSummary(productionOrders);
    const dedupedLiveArchiveOverlaps = orders.filter((order) => order.source_presence === 'both').length;
    const productionCustomerOrders = countDistinctCustomerOrders(productionOrders);

    return NextResponse.json({
      metadata: {
        query: { startDate, endDate, isTest: isTestParam, bookId, groupBy, historyScope },
        generatedAt: new Date().toISOString(),
        recordCount: totalOrders,
      },
      summary: {
        totalOrders,
        testOrders: testOrders.length,
        productionOrders: productionOrders.length,
        productionCustomerOrders,
        unknownOrders: unknownOrders.length,
      },
      kpis: {
        totalProductionOrders: productionOrders.length,
        productionCustomerOrders,
        activeLiveOrders: activeLiveOrders.length,
        awaitingApproval: awaitingApproval.length,
        inPrint: inPrint.length,
        shippedDelivered: shippedDelivered.length,
        attentionNeeded: attentionOrders.length,
      },
      workflowFunnel: [
        { stage: 'Intake', count: totalOrders },
        { stage: 'W2A Poses', count: orders.filter((order) => hasReachedPoses(order)).length },
        { stage: 'W2B Cutout', count: orders.filter((order) => hasReachedBackgroundRemoval(order)).length },
        { stage: 'W3 Pages', count: orders.filter((order) => hasReachedPages(order)).length },
        { stage: 'W4 / Lulu', count: orders.filter((order) => hasLuluActivity(order)).length },
      ],
      approvalFunnel: [
        { stage: 'Pending approval', count: awaitingApproval.length },
        {
          stage: 'Approved',
          count: orders.filter((order) => order.customer_approval_status === 'approved').length,
        },
        {
          stage: 'Revision requested',
          count: orders.filter((order) => order.customer_approval_status === 'revision_requested').length,
        },
      ],
      fulfillmentSummary: {
        submitted: orders.filter((order) => hasLuluActivity(order)).length,
        shipped: orders.filter((order) => isShipped(order)).length,
        delivered: orders.filter((order) => isDelivered(order)).length,
        canceledOrFailed: fulfillmentExceptions.length,
      },
      attentionSummary: {
        errorOrders: orders.filter(
          (order) => Boolean(order.error_type) || order.execution_status?.includes('error')
        ).length,
        retryingOrders: retryingOrders.length,
        fulfillmentExceptions: fulfillmentExceptions.length,
        topErrors,
      },
      platformBreakdown: [
        { platform: 'amazon', count: orders.filter((order) => order.platform === 'amazon').length },
        { platform: 'd2c', count: orders.filter((order) => order.platform === 'd2c').length },
        {
          platform: 'unknown',
          count: orders.filter((order) => !order.platform || !['amazon', 'd2c'].includes(order.platform)).length,
        },
      ],
      siblingSummary,
      multiItemSummary: productionSiblingSummary,
      provenanceSummary: {
        canonicalProductionOrders: productionOrders.length,
        canonicalCustomerOrders: productionCustomerOrders,
        dedupedLiveArchiveOverlaps,
        unknownClassificationRows: unknownOrders.length,
      },
      timeSeries: buildTimeSeries(orders, groupBy),
      statusBreakdown,
      errorBreakdown,
      totalsBySource: {
        liveRows: orders.filter((order) => order.source_presence === 'live').length,
        archivedRows: orders.filter((order) => order.source_presence === 'archived').length,
        bothSources: orders.filter((order) => order.source_presence === 'both').length,
        rootOrders: countDistinctCustomerOrders(orders),
      },
    });
  } catch (error: unknown) {
    console.error('[Analytics Overview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overview analytics', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
