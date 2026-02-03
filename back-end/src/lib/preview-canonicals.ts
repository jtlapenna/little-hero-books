/**
 * Map frontend CreateFlowCharacter IDs to w2A canonicals and asset paths.
 * Mirrors docs/n8n-workflow-files/nb-3-upgrades/w2A-SW0-Base_Character_Generation.json
 * (Resolve Skin Tone & Base Path, Resolve Hairstyle Key & Asset Path).
 */

const ASSET_ROOT_BASES = 'book-mvp-simple-adventure/characters/bases';
const ASSET_ROOT_HAIR = 'book-mvp-simple-adventure/characters/hairstyles';

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
const BASE_FILENAME_TEE_SHORTS: Record<string, string> = {
  'skin-light': 'base--skin-light.png',
  'skin-medium': 'base--skin-medium.jpg',
  'skin-tan': 'base--skin-tan.png',
  'skin-medium-dark': 'base--skin-medium-dark.png',
  'skin-deep': 'base--skin-deep.png',
  // Legacy (keep for backward compatibility with in-flight orders)
  'skin-brown-deep': 'base--skin-dark-aa.png',
  'skin-brown-light': 'base--skin-light-aa.png',
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
  skinToneCanonical: string;
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
  [key: string]: unknown;
}

/**
 * Resolve frontend character_specs to w2A canonicals and R2 keys for base + hair assets.
 */
export function resolvePreviewCanonicals(specs: CharacterSpecsInput): PreviewResolved {
  const skinRaw = (specs.skinTone ?? 'medium').toString().toLowerCase().trim();
  const skinToneCanonical = SKIN_MAP[skinRaw] ?? 'skin-medium';

  const clothingTypeCanonical = 'tee-shorts';
  const baseFilename = BASE_FILENAME_TEE_SHORTS[skinToneCanonical] ?? BASE_FILENAME_TEE_SHORTS['skin-medium'];
  const baseRefKey = `${ASSET_ROOT_BASES}/${baseFilename}`;

  const hairRaw = (specs.hairStyle ?? 'side-part').toString().toLowerCase().trim().replace(/\s+/g, '-');
  const hairStyleCanonical = HAIR_CANONICAL_SET.has(hairRaw) ? hairRaw : 'side-part';
  const colorRaw = (specs.hairColor ?? '').toString().toLowerCase().trim().replace(/\s+/g, '-');
  const hairColorSuffix = HAIR_COLOR_CHIP_SUFFIX[colorRaw] ?? DEFAULT_HAIR_COLOR_CHIP;
  const hairRefKey = `${ASSET_ROOT_HAIR}/${hairStyleCanonical}-${hairColorSuffix}.jpg`;

  const favColorRaw = (specs.favoriteColor ?? 'blue').toString().toLowerCase().trim();
  const favoriteColorHex = FAVORITE_COLOR_HEX[favColorRaw] ?? null;

  const hairColorLabel = (specs.hairColor ?? 'unspecified').toString().trim() || 'unspecified';

  return {
    skinToneCanonical,
    clothingTypeCanonical,
    baseRefKey,
    hairStyleCanonical,
    hairRefKey,
    favoriteColorHex,
    hairColorLabel,
    shortsHex: SHORTS_HEX,
  };
}
