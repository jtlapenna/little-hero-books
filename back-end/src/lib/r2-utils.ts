import { R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';

/**
 * Extract R2 key from URL.
 * Handles: /api/assets/{key} and public R2 URLs (https://pub-*.r2.dev/{key}).
 */
export function extractR2Key(url: string): string | null {
  try {
    const normalizedUrl = String(url || '')
      .trim()
      .replace(/^(https?):\/(?!\/)/i, '$1://');

    const urlObj = new URL(normalizedUrl, 'https://admin.littleherolabs.com');
    const pathname = urlObj.pathname;
    const hostname = urlObj.hostname || '';

    const apiMatch = pathname.match(/^\/api\/assets\/(.+)$/);
    if (apiMatch) return apiMatch[1];

    if (hostname.endsWith('.r2.dev') && pathname.startsWith('/') && pathname.length > 1) {
      return pathname.replace(/^\/+/, '');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Determine R2 bucket from key path.
 */
export function getBucketFromKey(key: string): string {
  const isOrderAsset = key.startsWith('book-mvp-simple-adventure/orders/');
  return isOrderAsset ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET;
}
