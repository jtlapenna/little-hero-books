import { NextRequest, NextResponse } from 'next/server';
import { getOrdersForAnalytics, AnalyticsFilters } from '@/lib/supabase-analytics';
import { isTestOrder, getLastNDays } from '@/lib/analytics-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/customizations
 * 
 * Returns customization choice breakdowns
 * 
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: today)
 * - isTest: 'true' | 'false' | undefined (filter test/production)
 * - bookId: string (filter by book ID)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const isTestParam = searchParams.get('isTest');
    const bookId = searchParams.get('bookId') || undefined;

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
    const totalOrders = orders.length;

    // Helper function to calculate distribution
    const calculateDistribution = (
      orders: any[],
      extractValue: (order: any) => string | number | null | undefined
    ): Array<{ value: string; count: number; percentage: number }> => {
      const counts: Record<string, number> = {};
      
      orders.forEach(order => {
        const value = extractValue(order);
        const key = value !== null && value !== undefined ? String(value) : 'unknown';
        counts[key] = (counts[key] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([value, count]) => ({
          value,
          count,
          percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100 * 100) / 100 : 0
        }))
        .sort((a, b) => b.count - a.count);
    };

    // Extract customization choices from character_specs
    const ageDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.age
    );

    const pronounsDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.pronouns
    );

    const skinToneDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.skinTone || o.character_specs?.skin_tone
    );

    const hairColorDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.hairColor || o.character_specs?.hair_color
    );

    const hairStyleDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.hairStyle || o.character_specs?.hair_style
    );

    const favoriteColorDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.favoriteColor || o.character_specs?.favorite_color
    );

    const animalGuideDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.animalGuide || o.character_specs?.animal_guide || o.character_specs?.favoriteAnimal
    );

    const clothingStyleDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.clothingStyle || o.character_specs?.clothing_style
    );

    const hometownDistribution = calculateDistribution(
      orders,
      (o) => o.character_specs?.hometown || o.character_specs?.homeTown
    );

    return NextResponse.json({
      metadata: {
        query: {
          startDate,
          endDate,
          isTest: isTestParam,
          bookId
        },
        generatedAt: new Date().toISOString(),
        recordCount: totalOrders
      },
      distributions: {
        age: ageDistribution,
        pronouns: pronounsDistribution,
        skinTone: skinToneDistribution,
        hairColor: hairColorDistribution,
        hairStyle: hairStyleDistribution,
        favoriteColor: favoriteColorDistribution,
        animalGuide: animalGuideDistribution,
        clothingStyle: clothingStyleDistribution,
        hometown: hometownDistribution
      }
    });
  } catch (error: any) {
    console.error('[Analytics Customizations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customization analytics', details: error.message },
      { status: 500 }
    );
  }
}

