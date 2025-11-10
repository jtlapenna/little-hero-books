/**
 * Background Images Configuration
 * 
 * Maps page numbers to Cloudflare Images IDs and URLs for optimized WebP delivery.
 * 
 * To populate: Run POST /api/backgrounds/upload-to-cloudflare endpoint, then
 * set the BACKGROUND_IMAGES_MAPPING environment variable with the mapping JSON.
 * 
 * Format: JSON string of { "0": { cloudflareImageId, cloudflareImageUrl, slug }, ... }
 */

export interface BackgroundImageConfig {
  cloudflareImageId: string;
  cloudflareImageUrl: string;
  slug: string;
}

// Load mapping from environment variable (set after running upload endpoint)
// Falls back to empty object if not configured
let backgroundImagesMapping: Record<number, BackgroundImageConfig> = {};

try {
  const mappingJson = process.env.BACKGROUND_IMAGES_MAPPING;
  if (mappingJson) {
    backgroundImagesMapping = JSON.parse(mappingJson);
    console.log('[Background Images] Loaded mapping from environment variable:', Object.keys(backgroundImagesMapping).length, 'images');
  }
} catch (error) {
  console.warn('[Background Images] Failed to parse BACKGROUND_IMAGES_MAPPING environment variable:', error);
}

export { backgroundImagesMapping };

/**
 * Get Cloudflare Images URL for a background image by page number
 * Falls back to R2 URL if Cloudflare Images is not configured
 */
export function getBackgroundImageUrl(pageNumber: number): string {
  const config = backgroundImagesMapping[pageNumber];
  
  if (config?.cloudflareImageUrl) {
    return config.cloudflareImageUrl;
  }
  
  // Fallback to R2 URL
  const sceneSlugs = [
    'dedication',        // page00
    'twilight-walk',    // page01
    'night-forest',     // page02
    'magic-doorway',    // page03
    'courage-leap',     // page04
    'morning-meadow',   // page05
    'tall-forest',      // page06
    'mountain-vista',   // page07
    'picnic-surprise',  // page08
    'beach-discovery',  // page09
    'crystal-cave',     // page10
    'giant-flowers',    // page11
    'almost-there',     // page12
    'animal-reveal',    // page13
    'flying-home'       // page14
  ];
  
  if (pageNumber === 0) {
    return '/api/assets/book-mvp-simple-adventure/backgrounds/page00-dedication.png';
  } else if (pageNumber >= 1 && pageNumber <= 14) {
    const slug = sceneSlugs[pageNumber];
    const padded = String(pageNumber).padStart(2, '0');
    return `/api/assets/book-mvp-simple-adventure/backgrounds/page${padded}-${slug}.png`;
  }
  
  return '';
}

