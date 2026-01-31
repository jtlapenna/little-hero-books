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
