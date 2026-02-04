/**
 * Preview cache check endpoint.
 * GET /api/preview/check?hash={hash} - check by hash directly
 * POST /api/preview/check - check by character_specs (computes hash server-side)
 * Response: { exists: boolean, imageUrl?: string, hash: string }
 * 
 * Also searches for existing orders with matching visual traits to reuse their base-character images.
 */

import { NextRequest, NextResponse } from 'next/server';
import { headObject, R2_PUBLIC_BUCKET, R2_CHARACTERS_PREFIX } from '@/lib/r2-client';
import { calculatePreviewHash } from '@/lib/character-hash';
import { supabase } from '@/lib/supabase-client';

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Visual trait keys used for matching (must match VISUAL_TRAIT_KEYS in character-hash.ts)
// Note: We use clothingType instead of pronouns since he/him and they/them both use t-shirt
const VISUAL_TRAIT_KEYS = ['skinTone', 'hairStyle', 'hairColor', 'favoriteColor'] as const;

/** Map pronouns to clothing type for matching. */
function getClothingTypeFromPronouns(pronouns: unknown): string {
  if (pronouns === 'she-her') return 'dress';
  return 't-shirt';
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Check cache by hash (HEAD request to R2). */
async function checkCacheByHash(hash: string): Promise<{ exists: boolean; imageUrl?: string }> {
  const previewKey = `${R2_CHARACTERS_PREFIX}${hash}/preview.png`;
  const response = await headObject(R2_PUBLIC_BUCKET, previewKey);
  
  if (response.ok) {
    return { exists: true, imageUrl: `/api/assets/${previewKey}` };
  }
  return { exists: false };
}

/**
 * Search for existing orders with matching visual traits.
 * Returns the character_hash of the first matching order that has a base-character image.
 */
async function findExistingOrderByVisualTraits(specs: Record<string, unknown>): Promise<{ characterHash: string; imageUrl: string } | null> {
  // Extract and normalize visual traits for comparison
  const visualTraits: Record<string, string> = {};
  for (const key of VISUAL_TRAIT_KEYS) {
    const value = specs[key];
    if (value !== undefined && value !== null && typeof value === 'string') {
      visualTraits[key] = value.toLowerCase().trim();
    }
  }
  // Add clothing type derived from pronouns
  visualTraits['clothingType'] = getClothingTypeFromPronouns(specs['pronouns']);
  
  // Query orders with character_specs containing matching visual traits
  // Note: This uses JSONB containment operator for efficient matching
  const { data: orders, error } = await supabase
    .from('orders')
    .select('character_hash, character_specs')
    .not('character_hash', 'is', null)
    .limit(50); // Check up to 50 recent orders
  
  if (error || !orders || orders.length === 0) {
    return null;
  }
  
  // Find an order with matching visual traits (ALL traits must match exactly)
  for (const order of orders) {
    const orderSpecs = order.character_specs as Record<string, unknown> | null;
    if (!orderSpecs || !order.character_hash) continue;
    
    // Compare visual traits - ALL must match exactly
    let match = true;
    for (const key of VISUAL_TRAIT_KEYS) {
      const specValue = visualTraits[key];
      const orderValue = orderSpecs[key];
      const normalizedOrderValue = typeof orderValue === 'string' ? orderValue.toLowerCase().trim() : null;
      
      // Both must exist and be equal, OR both must be missing
      if (specValue !== normalizedOrderValue) {
        match = false;
        break;
      }
    }
    
    // Also compare clothing type
    if (match) {
      const orderClothingType = getClothingTypeFromPronouns(orderSpecs['pronouns']);
      if (visualTraits['clothingType'] !== orderClothingType) {
        match = false;
      }
    }
    
    if (!match) continue;
    
    // Check if this order has a base-character image in R2
    const baseCharacterKey = `${R2_CHARACTERS_PREFIX}${order.character_hash}/base-character.png`;
    const response = await headObject(R2_PUBLIC_BUCKET, baseCharacterKey);
    
    if (response.ok) {
      console.log('[Preview Check] Found matching order with base-character:', order.character_hash);
      return {
        characterHash: order.character_hash,
        imageUrl: `/api/assets/${baseCharacterKey}`,
      };
    }
  }
  
  return null;
}

/** GET: check by hash query param. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');

    if (!hash || !/^[a-f0-9]{16}$/i.test(hash)) {
      return NextResponse.json(
        { error: 'Invalid or missing hash parameter (expected 16 hex chars)', exists: false },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await checkCacheByHash(hash);
    return NextResponse.json({ ...result, hash }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error('[Preview Check GET] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cache check failed', exists: false },
      { status: 500, headers: corsHeaders }
    );
  }
}

/** POST: check by character_specs (computes hash server-side for consistency). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const specs = body.character_specs ?? body.characterSpecs ?? {};

    if (!specs || typeof specs !== 'object' || Object.keys(specs).length === 0) {
      return NextResponse.json(
        { error: 'Missing character_specs', exists: false },
        { status: 400, headers: corsHeaders }
      );
    }

    // Compute hash server-side (ensures algorithm consistency)
    const hash = calculatePreviewHash(specs as Record<string, unknown>);
    
    // First check the D2C preview cache (preview_hash location)
    const previewResult = await checkCacheByHash(hash);
    if (previewResult.exists) {
      return NextResponse.json({ ...previewResult, hash, source: 'preview' }, { headers: corsHeaders });
    }
    
    // If not found, search for existing orders with matching visual traits
    // This allows reusing base-character images from Amazon orders
    try {
      const existingOrder = await findExistingOrderByVisualTraits(specs as Record<string, unknown>);
      if (existingOrder) {
        return NextResponse.json({
          exists: true,
          imageUrl: existingOrder.imageUrl,
          hash,
          characterHash: existingOrder.characterHash,
          source: 'existing_order',
        }, { headers: corsHeaders });
      }
    } catch (orderSearchError) {
      // Log but don't fail - this is an optimization, not required
      console.warn('[Preview Check] Order search failed (non-fatal):', orderSearchError);
    }

    return NextResponse.json({ exists: false, hash }, { headers: corsHeaders });
  } catch (err: unknown) {
    console.error('[Preview Check POST] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cache check failed', exists: false },
      { status: 500, headers: corsHeaders }
    );
  }
}
