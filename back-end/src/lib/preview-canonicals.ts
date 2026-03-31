/**
 * Map frontend CreateFlowCharacter IDs to w2A canonicals and asset paths.
 * Mirrors docs/n8n-workflow-files/nb-3-upgrades/w2A-SW0-Base_Character_Generation.json
 * (Resolve Skin Tone & Base Path, Resolve Hairstyle Key & Asset Path).
 */

import { loadBundledBookConfig } from '@/lib/books';
import type { BookConfig } from '@/lib/books';
import { SKIN_TONE_HEX_MAP } from '@/types/customization';

// Frontend skinTone (traitOptions) -> w2A skinToneCanonical
const SKIN_MAP: Record<string, string> = {
  light: 'skin-light',
  medium: 'skin-medium',
  tan: 'skin-tan',
  'medium-dark': 'skin-medium-dark',
  deep: 'skin-deep',
  // Legacy mappings (Amazon orders, old frontend)
  olive: 'skin-tan',
  dark: 'skin-deep',
  'skin-brown-deep': 'skin-deep',
  'skin-brown-light': 'skin-medium-dark',
};

// w2A FILENAME_MAP for tee-shorts only (preview default)
// Note: medium-dark uses light-aa files, deep uses dark-aa files (existing R2 assets)
const BASE_FILENAME_TEE_SHORTS: Record<string, string> = {
  'skin-light': 'base--skin-light.png',
  'skin-medium': 'base--skin-medium.jpg',
  'skin-tan': 'base--skin-tan.png',
  'skin-medium-dark': 'base--skin-light-aa.png',  // Reuses existing light-aa asset
  'skin-deep': 'base--skin-dark-aa.png',          // Reuses existing dark-aa asset
  // Legacy canonical names (backward compatibility)
  'skin-brown-light': 'base--skin-light-aa.png',
  'skin-brown-deep': 'base--skin-dark-aa.png',
};

// Frontend favoriteColor id -> hex (w2A CLOTHING_COLOR_MAP)
const FAVORITE_COLOR_HEX: Record<string, string> = {
  red: '#C83f3C',
  orange: '#DB8A2B',
  yellow: '#E2C351',
  green: '#76A355',
  blue: '#4575A5',
  pink: '#D77A8B',
  purple: '#6E5A93',
  brown: '#6B4E38',
  black: '#212327',
};

const SHORTS_HEX = '#5C7393';

// Hair styles valid in w2A (fallback side-part if unknown)
const HAIR_CANONICAL_SET = new Set([
  'ponytail', 'pigtails', 'straight-short', 'straight-medium', 'straight-long',
  'curly-short', 'curly-medium', 'curly-long', 'afro', 'pom-poms', 'bun', 'locs', 'side-part',
  'buzz', 'curly-crop', 'curly-tight', 'puffy-ponytail', 'small-puffy-ponytail',
]);

// Frontend hairColor id -> R2 chip filename suffix (style-color.jpg)
const HAIR_COLOR_CHIP_SUFFIX: Record<string, string> = {
  blonde: 'blonde',
  'strawberry-blonde': 'strawberry-blonde',
  'light-brown': 'light-brown',
  'medium-brown': 'medium-brown',
  'dark-brown': 'dark-brown',
  auburn: 'auburn',
  black: 'black',
  red: 'red',
};
const DEFAULT_HAIR_COLOR_CHIP = 'medium-brown';

export interface PreviewResolved {
  bookId: string;
  skinToneCanonical: string;
  skinToneHex: string | null;
  skinToneLabel: string | null;
  clothingTypeCanonical: string;
  baseRefKey: string;
  hairStyleCanonical: string;
  hairRefKey: string;
  favoriteColorHex: string | null;
  hairColorLabel: string;
  shortsHex: string;
}

export interface CharacterSpecsInput {
  skinTone?: string;
  hairStyle?: string;
  hairColor?: string;
  favoriteColor?: string;
  name?: string;
  age?: number;
  pronouns?: string;
  favoriteAnimal?: string;
  hometown?: string;
  clothingStyle?: string;
  [key: string]: unknown;
}

export interface ResolvePreviewCanonicalsOptions {
  bookId?: string | null;
}

/**
 * Map pronouns/gender to clothing type (mirrors n8n Normalize Payload logic).
 */
function mapClothingType(pronouns?: string, explicitClothing?: string): 'tee-shorts' | 'dress' {
  // Explicit clothing style takes priority
  if (explicitClothing) {
    const c = explicitClothing.toLowerCase().trim();
    if (c.includes('dress')) return 'dress';
    if (c.includes('tee') || c.includes('shorts')) return 'tee-shorts';
  }
  // Map from pronouns
  if (!pronouns) return 'tee-shorts';
  const p = pronouns.toLowerCase().trim();
  if (p.includes('girl') || p.includes('she')) return 'dress';
  return 'tee-shorts';
}

// w2A FILENAME_MAP for dress variants
const BASE_FILENAME_DRESS: Record<string, string> = {
  'skin-light': 'base--skin-light--dress.png',
  'skin-medium': 'base--skin-medium--dress.png',
  'skin-tan': 'base--skin-tan--dress.png',
  'skin-medium-dark': 'base--skin-light-aa--dress.png',
  'skin-deep': 'base--skin-dark-aa--dress.png',
  // Legacy
  'skin-brown-light': 'base--skin-light-aa--dress.png',
  'skin-brown-deep': 'base--skin-dark-aa--dress.png',
};

/**
 * Resolve frontend character_specs to w2A canonicals and R2 keys for base + hair assets.
 */
export function resolvePreviewCanonicalsForConfig(
  specs: CharacterSpecsInput,
  bookConfig: BookConfig,
): PreviewResolved {
  const baseCharactersPrefix =
    bookConfig.assets.preview?.baseCharactersPrefix ??
    `${bookConfig.assets.assetRoot}/characters/bases`;
  const hairstylesPrefix =
    bookConfig.assets.preview?.hairstylesPrefix ??
    `${bookConfig.assets.assetRoot}/characters/hairstyles`;
  const skinRaw = (specs.skinTone ?? 'medium').toString().toLowerCase().trim();
  const skinToneCanonical = SKIN_MAP[skinRaw] ?? 'skin-medium';

  // Determine clothing type from pronouns (or explicit clothingStyle)
  const clothingTypeCanonical = mapClothingType(specs.pronouns, specs.clothingStyle);
  
  // Select base image based on clothing type
  const filenameMap = clothingTypeCanonical === 'dress' ? BASE_FILENAME_DRESS : BASE_FILENAME_TEE_SHORTS;
  const baseFilename = filenameMap[skinToneCanonical] ?? filenameMap['skin-medium'];
  const baseRefKey = `${baseCharactersPrefix}/${baseFilename}`;

  const hairRaw = (specs.hairStyle ?? 'side-part').toString().toLowerCase().trim().replace(/\s+/g, '-');
  const hairStyleCanonical = HAIR_CANONICAL_SET.has(hairRaw) ? hairRaw : 'side-part';
  const colorRaw = (specs.hairColor ?? '').toString().toLowerCase().trim().replace(/\s+/g, '-');
  const hairColorSuffix = HAIR_COLOR_CHIP_SUFFIX[colorRaw] ?? DEFAULT_HAIR_COLOR_CHIP;
  const hairRefKey = `${hairstylesPrefix}/${hairStyleCanonical}-${hairColorSuffix}.jpg`;

  const favColorRaw = (specs.favoriteColor ?? 'blue').toString().toLowerCase().trim();
  const favoriteColorHex = FAVORITE_COLOR_HEX[favColorRaw] ?? null;

  const hairColorLabel = (specs.hairColor ?? 'unspecified').toString().trim() || 'unspecified';

  return {
    bookId: bookConfig.bookId,
    skinToneCanonical,
    skinToneHex: SKIN_TONE_HEX_MAP[skinToneCanonical as keyof typeof SKIN_TONE_HEX_MAP]?.hex ?? null,
    skinToneLabel: SKIN_TONE_HEX_MAP[skinToneCanonical as keyof typeof SKIN_TONE_HEX_MAP]?.label ?? null,
    clothingTypeCanonical,
    baseRefKey,
    hairStyleCanonical,
    hairRefKey,
    favoriteColorHex,
    hairColorLabel,
    shortsHex: SHORTS_HEX,
  };
}

export function resolvePreviewCanonicals(
  specs: CharacterSpecsInput,
  options: ResolvePreviewCanonicalsOptions = {},
): PreviewResolved {
  const requestedBookId =
    typeof options.bookId === 'string' ? options.bookId.trim() : '';
  if (!requestedBookId) {
    throw new Error('Preview canonical resolution requires an explicit bookId');
  }
  const bookConfig = loadBundledBookConfig({ bookId: requestedBookId });
  return resolvePreviewCanonicalsForConfig(specs, bookConfig);
}
