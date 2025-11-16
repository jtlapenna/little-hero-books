import { NextRequest, NextResponse } from 'next/server';
import { getOrdersForAnalytics, AnalyticsFilters } from '@/lib/supabase-analytics';
import { isTestOrder, getLastNDays, groupByTimePeriod } from '@/lib/analytics-helpers';

/**
 * Normalize clothing style to canonical value
 * Maps labels like "t-shirt and shorts" to "tee-shorts", "dress" stays "dress"
 */
function normalizeClothingStyle(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const normalized = String(value).toLowerCase().trim();
  
  // Filter out invalid values
  if (normalized === 'adventure' || normalized === 'book-mvp-simple-adventure') {
    return null;
  }
  
  // Map labels to canonical values
  if (normalized.includes('dress')) {
    return 'dress';
  }
  if (normalized.includes('tee') || normalized.includes('t-shirt') || normalized.includes('shorts')) {
    return 'tee-shorts';
  }
  
  // If already canonical, return as-is
  if (normalized === 'tee-shorts' || normalized === 'dress') {
    return normalized;
  }
  
  // Unknown value
  return null;
}

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
  // Helper to extract clothing style from manifest (async, used as fallback)
  async function extractClothingStyleFromManifest(orderId: string): Promise<string | null> {
    const manifestKeys = [
      `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`,
      `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`
    ];
    
    for (const manifestKey of manifestKeys) {
      try {
        const manifestUrl = `https://admin.littleherolabs.com/api/manifests/${manifestKey}`;
        const response = await fetch(manifestUrl, { 
          cache: 'no-store',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        
        if (response.ok) {
          const manifest = await response.json();
          const manifestClothing = manifest?.order?.characterSpecs?.clothingStyle || 
                                 manifest?.order?.characterSpecs?.clothingTypeCanonical;
          const normalized = normalizeClothingStyle(manifestClothing);
          if (normalized) return normalized;
        }
      } catch (err) {
        // Silently fail - manifest might not exist or be slow
        continue;
      }
    }
    
    return null;
  }

  // Helper to extract hometown from manifest (async, used as fallback)
  async function extractHometownFromManifest(orderId: string): Promise<string | null> {
    const manifestKeys = [
      `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`,
      `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`
    ];
    
    for (const manifestKey of manifestKeys) {
      try {
        const manifestUrl = `https://admin.littleherolabs.com/api/manifests/${manifestKey}`;
        const response = await fetch(manifestUrl, { 
          cache: 'no-store',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        
        if (response.ok) {
          const manifest = await response.json();
          const hometown = manifest?.order?.characterSpecs?.hometown || 
                          manifest?.order?.characterSpecs?.homeTown ||
                          manifest?.order?.options?.hometown;
          if (hometown) return String(hometown).trim();
        }
      } catch (err) {
        // Silently fail - manifest might not exist or be slow
        continue;
      }
    }
    
    return null;
  }

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

    // Top customization choices (most popular choice for each category)
    const getTopChoice = (orders: any[], field: string, altFields?: string[]): { value: string; count: number; percentage: number } | null => {
      const counts: Record<string, number> = {};
      orders.forEach(order => {
        const specs = order.character_specs || {};
        let value = specs[field];
        if (!value && altFields) {
          for (const altField of altFields) {
            if (specs[altField]) {
              value = specs[altField];
              break;
            }
          }
        }
        const key = value !== null && value !== undefined ? String(value) : 'unknown';
        counts[key] = (counts[key] || 0) + 1;
      });
      
      if (Object.keys(counts).length === 0) return null;
      
      const sorted = Object.entries(counts)
        .map(([value, count]) => ({ value, count, percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100 * 100) / 100 : 0 }))
        .sort((a, b) => b.count - a.count);
      
      return sorted[0];
    };

    const topCustomizations = {
      skinTone: getTopChoice(orders, 'skinTone', ['skin_tone']),
      hairColor: getTopChoice(orders, 'hairColor', ['hair_color']),
      hairStyle: getTopChoice(orders, 'hairStyle', ['hair_style']),
      animalGuide: getTopChoice(orders, 'animalGuide', ['animal_guide', 'favoriteAnimal']),
      hometown: null, // Will be calculated asynchronously below
      pronouns: getTopChoice(orders, 'pronouns'),
      favoriteColor: getTopChoice(orders, 'favoriteColor', ['favorite_color']),
      clothingStyle: null // Will be calculated asynchronously below
    };

    // Extract clothing style and hometown with manifest fallback
    // First, collect orders that need manifest lookup
    const ordersNeedingManifestLookup: Array<{ order: any; index: number }> = [];
    const clothingStyleValues: (string | null)[] = new Array(orders.length);
    const hometownValues: (string | null)[] = new Array(orders.length);

    // First pass: extract from character_specs
    orders.forEach((order, index) => {
      // Clothing style
      const specs = order.character_specs || {};
      const clothing = specs.clothingStyle || specs.clothing_style || specs.clothingTypeCanonical;
      const normalizedClothing = normalizeClothingStyle(clothing);
      clothingStyleValues[index] = normalizedClothing;

      // Hometown
      const hometown = order.character_specs?.hometown || 
                      order.character_specs?.homeTown || 
                      order.book_specs?.hometown;
      hometownValues[index] = hometown ? String(hometown).trim() : null;

      // If either is missing, add to lookup list
      if (!normalizedClothing || !hometownValues[index]) {
        ordersNeedingManifestLookup.push({ order, index });
      }
    });

    // Second pass: fetch manifests for orders missing data (in parallel batches)
    if (ordersNeedingManifestLookup.length > 0) {
      // Process in batches of 10 to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < ordersNeedingManifestLookup.length; i += batchSize) {
        const batch = ordersNeedingManifestLookup.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ({ order, index }) => {
            const orderId = order.amazon_order_id;
            if (!orderId) return;

            // Fetch clothing style if missing
            if (!clothingStyleValues[index]) {
              const clothing = await extractClothingStyleFromManifest(orderId);
              if (clothing) clothingStyleValues[index] = clothing;
            }

            // Fetch hometown if missing
            if (!hometownValues[index]) {
              const hometown = await extractHometownFromManifest(orderId);
              if (hometown) hometownValues[index] = hometown;
            }
          })
        );
      }
    }

    // Calculate top customizations with manifest data
    const clothingStyleCounts: Record<string, number> = {};
    const hometownCounts: Record<string, number> = {};
    clothingStyleValues.forEach(value => {
      if (value) {
        clothingStyleCounts[value] = (clothingStyleCounts[value] || 0) + 1;
      }
    });
    hometownValues.forEach(value => {
      if (value) {
        hometownCounts[value] = (hometownCounts[value] || 0) + 1;
      }
    });

    const topClothingStyle = Object.keys(clothingStyleCounts).length > 0
      ? Object.entries(clothingStyleCounts)
          .map(([value, count]) => ({ 
            value, 
            count, 
            percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100 * 100) / 100 : 0 
          }))
          .sort((a, b) => b.count - a.count)[0]
      : null;

    const topHometown = Object.keys(hometownCounts).length > 0
      ? Object.entries(hometownCounts)
          .map(([value, count]) => ({ 
            value, 
            count, 
            percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100 * 100) / 100 : 0 
          }))
          .sort((a, b) => b.count - a.count)[0]
      : null;

    // Update topCustomizations with calculated values
    topCustomizations.clothingStyle = topClothingStyle;
    topCustomizations.hometown = topHometown;

    // Full customization distributions (all options with counts)
    const calculateDistribution = (
      orders: any[],
      extractValue: (order: any, index?: number) => string | number | null | undefined
    ): Array<{ value: string; count: number; percentage: number }> => {
      const counts: Record<string, number> = {};
      
      orders.forEach((order, index) => {
        const value = extractValue(order, index);
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

    const customizationDistributions = {
      skinTone: calculateDistribution(orders, (o) => o.character_specs?.skinTone || o.character_specs?.skin_tone),
      hairColor: calculateDistribution(orders, (o) => o.character_specs?.hairColor || o.character_specs?.hair_color),
      hairStyle: calculateDistribution(orders, (o) => o.character_specs?.hairStyle || o.character_specs?.hair_style),
      animalGuide: calculateDistribution(orders, (o) => o.character_specs?.animalGuide || o.character_specs?.animal_guide || o.character_specs?.favoriteAnimal),
      hometown: calculateDistribution(orders, (o, index) => {
        // Use the pre-fetched hometown value
        return hometownValues[index] || null;
      }),
      pronouns: calculateDistribution(orders, (o) => o.character_specs?.pronouns),
      favoriteColor: calculateDistribution(orders, (o) => o.character_specs?.favoriteColor || o.character_specs?.favorite_color),
      clothingStyle: calculateDistribution(orders, (o, index) => {
        // Use the pre-fetched clothing style value
        return clothingStyleValues[index] || null;
      })
    };

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
      timeSeries,
      topCustomizations,
      customizationDistributions
    });
  } catch (error: any) {
    console.error('[Analytics Overview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overview analytics', details: error.message },
      { status: 500 }
    );
  }
}

