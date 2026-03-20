/**
 * Background Images Configuration
 *
 * Maps book/format/page identities to Cloudflare Images URLs for optimized delivery.
 *
 * Legacy env format is still supported:
 * `{ "0": { cloudflareImageId, cloudflareImageUrl, slug } }`
 *
 * Preferred multi-book keys are:
 * - `${bookId}:${formatId}:${pageLabel}`
 * - `${bookId}:${formatId}:${pageNumber}`
 * - `${pageLabel}`
 * - `${pageNumber}`
 */

import { getBookFormatConfig, loadBundledBookConfig } from '@/lib/books';
import type { BookConfig } from '@/lib/books';
import { buildAssetApiUrl, normalizeBookId } from '@/lib/order-paths';

export interface BackgroundImageConfig {
  cloudflareImageId: string;
  cloudflareImageUrl: string;
  slug: string;
}

export interface BackgroundImageLookupOptions {
  bookId?: string | null;
  formatId?: string | null;
}

type BackgroundImageMapping = Record<string, BackgroundImageConfig>;

let backgroundImagesMapping: BackgroundImageMapping = {};

try {
  const mappingJson = process.env.BACKGROUND_IMAGES_MAPPING;
  if (mappingJson) {
    backgroundImagesMapping = JSON.parse(mappingJson) as BackgroundImageMapping;
    console.log(
      '[Background Images] Loaded mapping from environment variable:',
      Object.keys(backgroundImagesMapping).length,
      'images',
    );
  }
} catch (error) {
  console.warn(
    '[Background Images] Failed to parse BACKGROUND_IMAGES_MAPPING environment variable:',
    error,
  );
}

export { backgroundImagesMapping };

export function resolvePageBackgroundForConfig(
  pageNumber: number,
  config: BookConfig,
  options: Omit<BackgroundImageLookupOptions, 'bookId'> = {},
): {
  bookId: string;
  formatId: string;
  pageLabel: string;
  backgroundSlot: string;
  backgroundKey: string;
} | null {
  const format = getBookFormatConfig(config, options.formatId ?? undefined);
  const pageConfig = format.interior.pageSequence[pageNumber];
  const backgroundSlot = pageConfig?.backgroundSlot;

  if (!pageConfig || !backgroundSlot) {
    return null;
  }

  const backgroundKey = config.assets.backgrounds[backgroundSlot];
  if (!backgroundKey) {
    return null;
  }

  return {
    bookId: config.bookId,
    formatId: format.formatId,
    pageLabel: pageConfig.label,
    backgroundSlot,
    backgroundKey,
  };
}

function resolveMappedBackground(
  pageNumber: number,
  resolved: NonNullable<ReturnType<typeof resolvePageBackgroundForConfig>>,
): BackgroundImageConfig | null {
  const candidates = [
    `${resolved.bookId}:${resolved.formatId}:${resolved.pageLabel}`,
    `${resolved.bookId}:${resolved.formatId}:${pageNumber}`,
    `${resolved.bookId}:${resolved.pageLabel}`,
    `${resolved.bookId}:${pageNumber}`,
    resolved.pageLabel,
    String(pageNumber),
  ];

  for (const key of candidates) {
    const config = backgroundImagesMapping[key];
    if (config?.cloudflareImageUrl) {
      return config;
    }
  }

  return null;
}

export function getBackgroundImageUrl(
  pageNumber: number,
  options: BackgroundImageLookupOptions = {},
): string {
  const bookId = normalizeBookId(options.bookId);
  const config = loadBundledBookConfig({ bookId });
  return getBackgroundImageUrlForConfig(pageNumber, config, {
    formatId: options.formatId ?? undefined,
  });
}

export function getBackgroundImageUrlForConfig(
  pageNumber: number,
  config: BookConfig,
  options: Omit<BackgroundImageLookupOptions, 'bookId'> = {},
): string {
  const resolved = resolvePageBackgroundForConfig(pageNumber, config, options);
  if (!resolved) {
    return '';
  }

  const mapped = resolveMappedBackground(pageNumber, resolved);
  if (mapped?.cloudflareImageUrl) {
    return mapped.cloudflareImageUrl;
  }

  return buildAssetApiUrl(resolved.backgroundKey);
}
