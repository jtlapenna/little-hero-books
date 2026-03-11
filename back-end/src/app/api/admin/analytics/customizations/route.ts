import { NextRequest, NextResponse } from 'next/server';

import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getLastNDays } from '@/lib/analytics-helpers';
import { AnalyticsFilters, AnalyticsReportingRecord, getOrdersForAnalytics } from '@/lib/supabase-analytics';

export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeClothingStyle(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = String(value).toLowerCase().trim();
  if (normalized === 'adventure' || normalized === 'book-mvp-simple-adventure') {
    return null;
  }
  if (normalized.includes('dress')) return 'dress';
  if (normalized.includes('tee') || normalized.includes('t-shirt') || normalized.includes('shorts')) {
    return 'tee-shorts';
  }
  if (normalized === 'tee-shorts' || normalized === 'dress') return normalized;

  return null;
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeTextValue(value: string | number | null | undefined): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return compact;
}

function normalizeHairStyle(value: string | number | null | undefined): string | number | null {
  const normalized = normalizeTextValue(value);
  if (normalized === null || typeof normalized === 'number') return normalized;

  const key = normalized.toLowerCase();
  const aliases: Record<string, string> = {
    'side part': 'Side Part',
    'side-part': 'Side Part',
    'curly crop': 'Curly Crop',
    'curly-crop': 'Curly Crop',
    'curly medium': 'Curly Medium',
    'curly-medium': 'Curly Medium',
    'curly long': 'Curly Long',
    'curly-long': 'Curly Long',
    'curly short': 'Curly Short',
    'curly-short': 'Curly Short',
    'short curly': 'Short Curly',
    'short-curly': 'Short Curly',
    'straight short': 'Straight Short',
    'straight-short': 'Straight Short',
    'straight long': 'Straight Long',
    'straight-long': 'Straight Long',
    'curly bob': 'Curly Bob',
    'curly-bob': 'Curly Bob',
    'puffy ponytail': 'Puffy Ponytail',
    'puffy-ponytail': 'Puffy Ponytail',
    'pom poms': 'Pom-Poms',
    'pom-poms': 'Pom-Poms',
  };

  return aliases[key] || toTitleCase(key);
}

function normalizeHometown(value: string | number | null | undefined): string | number | null {
  const normalized = normalizeTextValue(value);
  if (normalized === null || typeof normalized === 'number') return normalized;

  const key = normalized.toLowerCase();
  if (key === 'gv') return 'GV';
  return toTitleCase(key);
}

function normalizeTraitValue(
  trait: 'age' | 'pronouns' | 'skinTone' | 'hairColor' | 'hairStyle' | 'favoriteColor' | 'animalGuide' | 'clothingStyle' | 'hometown',
  value: string | number | null | undefined
): string | number | null {
  switch (trait) {
    case 'hairStyle':
      return normalizeHairStyle(value);
    case 'hometown':
      return normalizeHometown(value);
    case 'clothingStyle':
      return normalizeClothingStyle(value as string | null | undefined);
    case 'pronouns': {
      const normalized = normalizeTextValue(value);
      return normalized && typeof normalized === 'string' ? toTitleCase(normalized.toLowerCase()) : normalized;
    }
    case 'skinTone':
    case 'hairColor':
    case 'favoriteColor':
    case 'animalGuide': {
      const normalized = normalizeTextValue(value);
      return normalized && typeof normalized === 'string' ? toTitleCase(normalized.toLowerCase()) : normalized;
    }
    case 'age':
    default:
      return normalizeTextValue(value);
  }
}

async function extractClothingStyleFromManifest(orderId: string): Promise<string | null> {
  const manifestKeys = [
    `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`,
    `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`,
  ];

  for (const manifestKey of manifestKeys) {
    try {
      const response = await getObject(R2_ORDERS_BUCKET, manifestKey);
      const manifest = JSON.parse(await response.text());
      const manifestClothing =
        manifest?.order?.characterSpecs?.clothingStyle ||
        manifest?.order?.characterSpecs?.clothingTypeCanonical ||
        manifest?.order?.characterSpecs?.clothing_style ||
        manifest?.order?.clothingStyle;
      const normalized = normalizeClothingStyle(manifestClothing);
      if (normalized) return normalized;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message.includes('404') || message.includes('NoSuchKey')) continue;
      console.warn(`[Analytics] Error fetching manifest ${manifestKey} for order ${orderId}:`, message);
    }
  }

  return null;
}

async function extractHometownFromManifest(orderId: string): Promise<string | null> {
  const manifestKeys = [
    `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`,
    `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`,
  ];

  for (const manifestKey of manifestKeys) {
    try {
      const response = await getObject(R2_ORDERS_BUCKET, manifestKey);
      const manifest = JSON.parse(await response.text());
      const hometown =
        manifest?.order?.characterSpecs?.hometown ||
        manifest?.order?.characterSpecs?.homeTown ||
        manifest?.order?.options?.hometown ||
        manifest?.order?.hometown;
      if (hometown) return String(hometown).trim();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message.includes('404') || message.includes('NoSuchKey')) continue;
      console.warn(`[Analytics] Error fetching manifest ${manifestKey} for order ${orderId}:`, message);
    }
  }

  return null;
}

function calculateDistribution(
  orders: AnalyticsReportingRecord[],
  extractValue: (order: AnalyticsReportingRecord, index: number) => string | number | null | undefined,
  trait:
    | 'age'
    | 'pronouns'
    | 'skinTone'
    | 'hairColor'
    | 'hairStyle'
    | 'favoriteColor'
    | 'animalGuide'
    | 'clothingStyle'
    | 'hometown'
) {
  const totalOrders = orders.length;
  const counts: Record<string, number> = {};

  orders.forEach((order, index) => {
    const value = normalizeTraitValue(trait, extractValue(order, index));
    const key = value !== null && value !== undefined && String(value).trim().length > 0 ? String(value) : 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([value, count]) => ({
      value,
      count,
      percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 100 * 100) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const isTestParam = searchParams.get('isTest');
    const bookId = searchParams.get('bookId') || undefined;
    const historyScope = (searchParams.get('historyScope') || 'all') as AnalyticsFilters['historyScope'];

    const { start: defaultStart, end: defaultEnd } = getLastNDays(30);
    const startDate = startDateParam || defaultStart.toISOString();
    const endDate = endDateParam || defaultEnd.toISOString();

    let isTest: boolean | undefined;
    if (isTestParam === 'true') isTest = true;
    if (isTestParam === 'false') isTest = false;

    const filters: AnalyticsFilters = { startDate, endDate, isTest, bookId, historyScope };
    const orders = await getOrdersForAnalytics(filters);

    const clothingStyleValues: (string | null)[] = new Array(orders.length);
    const hometownValues: (string | null)[] = new Array(orders.length);
    const ordersNeedingManifestLookup: Array<{ order: AnalyticsReportingRecord; index: number }> = [];

    orders.forEach((order, index) => {
      const specs = order.character_specs || {};
      const clothing = specs.clothingStyle || specs.clothing_style || specs.clothingTypeCanonical;
      clothingStyleValues[index] = normalizeClothingStyle(clothing);

      const hometown =
        order.character_specs?.hometown || order.character_specs?.homeTown || order.book_specs?.hometown;
      hometownValues[index] = hometown ? String(hometown).trim() : null;

      if (!clothingStyleValues[index] || !hometownValues[index]) {
        ordersNeedingManifestLookup.push({ order, index });
      }
    });

    if (ordersNeedingManifestLookup.length > 0) {
      const batchSize = 10;
      for (let index = 0; index < ordersNeedingManifestLookup.length; index += batchSize) {
        const batch = ordersNeedingManifestLookup.slice(index, index + batchSize);
        await Promise.all(
          batch.map(async ({ order, index: orderIndex }) => {
            const orderId = order.amazon_order_id;
            if (!orderId) return;

            if (!clothingStyleValues[orderIndex]) {
              const clothing = await extractClothingStyleFromManifest(orderId);
              if (clothing) clothingStyleValues[orderIndex] = clothing;
            }

            if (!hometownValues[orderIndex]) {
              const hometown = await extractHometownFromManifest(orderId);
              if (hometown) hometownValues[orderIndex] = hometown;
            }
          })
        );
      }
    }

    return NextResponse.json({
      metadata: {
        query: { startDate, endDate, isTest: isTestParam, bookId, historyScope },
        generatedAt: new Date().toISOString(),
        recordCount: orders.length,
      },
      distributions: {
        age: calculateDistribution(orders, (order) => order.character_specs?.age, 'age'),
        pronouns: calculateDistribution(orders, (order) => order.character_specs?.pronouns, 'pronouns'),
        skinTone: calculateDistribution(
          orders,
          (order) => order.character_specs?.skinTone || order.character_specs?.skin_tone,
          'skinTone'
        ),
        hairColor: calculateDistribution(
          orders,
          (order) => order.character_specs?.hairColor || order.character_specs?.hair_color,
          'hairColor'
        ),
        hairStyle: calculateDistribution(
          orders,
          (order) => order.character_specs?.hairStyle || order.character_specs?.hair_style,
          'hairStyle'
        ),
        favoriteColor: calculateDistribution(
          orders,
          (order) => order.character_specs?.favoriteColor || order.character_specs?.favorite_color,
          'favoriteColor'
        ),
        animalGuide: calculateDistribution(
          orders,
          (order) => order.character_specs?.animalGuide || order.character_specs?.animal_guide || order.character_specs?.favoriteAnimal,
          'animalGuide'
        ),
        clothingStyle: calculateDistribution(orders, (_order, index) => clothingStyleValues[index], 'clothingStyle'),
        hometown: calculateDistribution(orders, (_order, index) => hometownValues[index], 'hometown'),
      },
    });
  } catch (error: unknown) {
    console.error('[Analytics Customizations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customization analytics', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
