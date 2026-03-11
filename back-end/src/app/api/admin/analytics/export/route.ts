import { NextRequest, NextResponse } from 'next/server';

import { getLastNDays } from '@/lib/analytics-helpers';
import { AnalyticsFilters, getOrdersForAnalytics } from '@/lib/supabase-analytics';

export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const isTestParam = searchParams.get('isTest');
    const bookId = searchParams.get('bookId') || undefined;
    const historyScope = (searchParams.get('historyScope') || 'all') as AnalyticsFilters['historyScope'];
    const format = (searchParams.get('format') || 'csv') as 'csv' | 'json';

    const { start: defaultStart, end: defaultEnd } = getLastNDays(30);
    const startDate = startDateParam || defaultStart.toISOString();
    const endDate = endDateParam || defaultEnd.toISOString();

    let isTest: boolean | undefined;
    if (isTestParam === 'true') isTest = true;
    if (isTestParam === 'false') isTest = false;

    const filters: AnalyticsFilters = { startDate, endDate, isTest, bookId, historyScope };
    const orders = await getOrdersForAnalytics(filters);

    if (format === 'json') {
      return NextResponse.json(
        {
          metadata: {
            query: { startDate, endDate, isTest: isTestParam, bookId, historyScope },
            generatedAt: new Date().toISOString(),
            recordCount: orders.length,
          },
          orders: orders.map((order) => ({
            id: order.id,
            orderId: order.orderId,
            root_order_id: order.root_order_id,
            display_order_id: order.display_order_id,
            record_source: order.record_source,
            source_presence: order.source_presence,
            dedupe_key: order.dedupe_key,
            canonical_group_key: order.canonical_group_key,
            lifecycle_status: order.lifecycle_status,
            platform: order.platform,
            amazon_order_id: order.amazon_order_id,
            created_at: order.created_at,
            status: order.status,
            execution_status: order.execution_status,
            classification: order.classification,
            classification_reason: order.classification_reason,
            is_multi_item_order: order.is_multi_item_order,
            item_count_in_group: order.item_count_in_group,
            duplicate_row_count: order.duplicate_row_count,
            character_specs: order.character_specs,
            error_type: order.error_type,
            error_message: order.error_message,
            retry_count: order.retry_count,
            regeneration_attempt: order.regeneration_attempt,
          })),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.json"`,
          },
        }
      );
    }

    if (orders.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 400 });
    }

    const headers = [
      'Order ID',
      'Canonical Order ID',
      'Root Order ID',
      'Display Order ID',
      'Record Source',
      'Source Presence',
      'Dedupe Key',
      'Canonical Group Key',
      'Lifecycle Status',
      'Platform',
      'Amazon Order ID',
      'Created At',
      'Status',
      'Execution Status',
      'Classification',
      'Classification Reason',
      'Is Multi Item Order',
      'Item Count In Group',
      'Duplicate Row Count',
      'Age',
      'Pronouns',
      'Skin Tone',
      'Hair Color',
      'Hair Style',
      'Favorite Color',
      'Animal Guide',
      'Clothing Style',
      'Error Type',
      'Retry Count',
      'Regeneration Attempt',
    ];

    const rows = orders.map((order) => {
      const specs = order.character_specs || {};
      return [
        order.id,
        order.orderId || '',
        order.root_order_id || '',
        order.display_order_id || '',
        order.record_source,
        order.source_presence,
        order.dedupe_key,
        order.canonical_group_key || '',
        order.lifecycle_status || '',
        order.platform || '',
        order.amazon_order_id || '',
        order.created_at,
        order.status || '',
        order.execution_status || '',
        order.classification,
        order.classification_reason,
        order.is_multi_item_order ? 'Yes' : 'No',
        order.item_count_in_group,
        order.duplicate_row_count,
        specs.age || '',
        specs.pronouns || '',
        specs.skinTone || specs.skin_tone || '',
        specs.hairColor || specs.hair_color || '',
        specs.hairStyle || specs.hair_style || '',
        specs.favoriteColor || specs.favorite_color || '',
        specs.animalGuide || specs.animal_guide || specs.favoriteAnimal || '',
        specs.clothingStyle || specs.clothing_style || '',
        order.error_type || '',
        order.retry_count || 0,
        order.regeneration_attempt || 0,
      ].map((cell) => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      });
    });

    return new NextResponse([headers.join(','), ...rows.map((row) => row.join(','))].join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: unknown) {
    console.error('[Analytics Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics data', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
