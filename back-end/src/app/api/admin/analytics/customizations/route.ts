import { NextRequest, NextResponse } from 'next/server';
import { getOrdersForAnalytics, AnalyticsFilters } from '@/lib/supabase-analytics';
import { isTestOrder, getLastNDays } from '@/lib/analytics-helpers';

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

    // Extract clothing style and hometown with manifest fallback
    const clothingStyleValues: (string | null)[] = new Array(orders.length);
    const hometownValues: (string | null)[] = new Array(orders.length);
    const ordersNeedingManifestLookup: Array<{ order: any; index: number }> = [];

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

    const clothingStyleDistribution = calculateDistribution(
      orders,
      (o, index) => {
        // Use the pre-fetched clothing style value
        return clothingStyleValues[index] || null;
      }
    );

    const hometownDistribution = calculateDistribution(
      orders,
      (o, index) => {
        // Use the pre-fetched hometown value
        return hometownValues[index] || null;
      }
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

