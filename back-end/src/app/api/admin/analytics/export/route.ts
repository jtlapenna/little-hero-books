import { NextRequest, NextResponse } from 'next/server';
import { getOrdersForAnalytics, AnalyticsFilters } from '@/lib/supabase-analytics';
import { isTestOrder, getLastNDays } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/export
 * 
 * Exports analytics data in CSV or JSON format
 * 
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: today)
 * - isTest: 'true' | 'false' | undefined (filter test/production)
 * - bookId: string (filter by book ID)
 * - format: 'csv' | 'json' (default: 'csv')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const isTestParam = searchParams.get('isTest');
    const bookId = searchParams.get('bookId') || undefined;
    const format = (searchParams.get('format') || 'csv') as 'csv' | 'json';

    // Default to last 30 days if not specified
    const { start: defaultStart, end: defaultEnd } = getLastNDays(30);
    const startDate = startDateParam || defaultStart.toISOString();
    const endDate = endDateParam || defaultEnd.toISOString();

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

    if (format === 'json') {
      return NextResponse.json(
        {
          metadata: {
            query: { startDate, endDate, isTest: isTestParam, bookId },
            generatedAt: new Date().toISOString(),
            recordCount: orders.length
          },
          orders: orders.map(order => ({
            id: order.id,
            amazon_order_id: order.amazon_order_id,
            created_at: order.created_at,
            status: order.status,
            execution_status: order.execution_status,
            is_test: isTestOrder(order.amazon_order_id),
            character_specs: order.character_specs,
            error_type: order.error_type,
            error_message: order.error_message,
            retry_count: order.retry_count,
            regeneration_attempt: order.regeneration_attempt
          }))
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.json"`
          }
        }
      );
    }

    // CSV format
    if (orders.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 400 });
    }

    // Build CSV headers
    const headers = [
      'Order ID',
      'Amazon Order ID',
      'Created At',
      'Status',
      'Execution Status',
      'Is Test',
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
      'Regeneration Attempt'
    ];

    // Build CSV rows
    const rows = orders.map(order => {
      const specs = order.character_specs || {};
      return [
        order.id,
        order.amazon_order_id,
        order.created_at,
        order.status || '',
        order.execution_status || '',
        isTestOrder(order.amazon_order_id) ? 'Yes' : 'No',
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
        order.regeneration_attempt || 0
      ].map(cell => {
        // Escape CSV cells (handle commas, quotes, newlines)
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      });
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.csv"`
      }
    });
  } catch (error: any) {
    console.error('[Analytics Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics data', details: error.message },
      { status: 500 }
    );
  }
}

