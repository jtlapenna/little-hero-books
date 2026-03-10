/**
 * Character hash for order identity and caching.
 * Same algorithm as Amazon cron: sort characterSpecs keys, include orderId, MD5 first 16 chars.
 */

import { createHash } from 'crypto';

/**
 * Calculate character hash from character specs and order ID.
 * Includes orderId in hash to ensure uniqueness per order (prevents collisions).
 * Format: MD5 hash of (characterSpecs + orderId), first 16 characters.
 */
export function calculateCharacterHash(
  characterSpecs: Record<string, unknown>,
  orderId: string
): string {
  const sortedSpecs = Object.keys(characterSpecs)
    .sort()
    .reduce((acc, key) => {
      acc[key] = characterSpecs[key];
      return acc;
    }, {} as Record<string, unknown>);

  const hashInput = JSON.stringify({ ...sortedSpecs, orderId });

  return createHash('md5').update(hashInput).digest('hex').substring(0, 16);
}

/**
 * Visual traits that affect character appearance (used for preview caching).
 * Only these traits change the generated image; name, age, hometown, etc. do not.
 * Note: We use clothingType instead of pronouns since he/him and they/them both use t-shirt.
 */
const VISUAL_TRAIT_KEYS = ['skinTone', 'hairStyle', 'hairColor', 'favoriteColor'] as const;
const PREVIEW_HASH_VERSION = 'v2';

/**
 * Map pronouns to clothing type for hash calculation.
 * she/her → dress, everything else → t-shirt
 */
function getClothingTypeFromPronouns(pronouns: unknown): string {
  if (pronouns === 'she-her') return 'dress';
  return 't-shirt';
}

/**
 * Calculate preview hash from visual traits only (no orderId).
 * Used for D2C preview caching — same visual traits always produce the same hash.
 * Format: MD5 hash of sorted visual traits, first 16 characters.
 */
export function calculatePreviewHash(
  characterSpecs: Record<string, unknown>
): string {
  // Extract and normalize only visual traits
  const visualTraits = VISUAL_TRAIT_KEYS.reduce((acc, key) => {
    const value = characterSpecs[key];
    // Normalize: lowercase string values, skip undefined
    if (value !== undefined && value !== null) {
      acc[key] = typeof value === 'string' ? value.toLowerCase().trim() : value;
    }
    return acc;
  }, {} as Record<string, unknown>);

  // Add clothing type derived from pronouns (he/him and they/them both = t-shirt)
  visualTraits['clothingType'] = getClothingTypeFromPronouns(characterSpecs['pronouns']);

  // Sort keys for deterministic hash
  const sorted = Object.keys(visualTraits)
    .sort()
    .reduce((acc, key) => {
      acc[key] = visualTraits[key];
      return acc;
    }, {} as Record<string, unknown>);

  return createHash('md5')
    .update(JSON.stringify({ ...sorted, previewVersion: PREVIEW_HASH_VERSION }))
    .digest('hex')
    .substring(0, 16);
}
