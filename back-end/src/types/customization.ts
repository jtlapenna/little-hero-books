// Central source of truth for personalization option enums/constants
// Import and reuse across API, webhooks, and validation

// === Hair Styles (from assets/hair-references, excluding bob) ===
export const HAIR_STYLES = [
  'afro',
  'bun',
  'curly-long',
  'curly-medium',
  'curly-short',
  'pigtails',
  'pom-poms',
  'ponytail',
  'side-part',
  'straight-long',
  'straight-medium',
  'straight-short',
] as const;
export type HairStyle = typeof HAIR_STYLES[number];

// === Hair Colors (from provided HAIR_COLOR_MAP) ===
export const HAIR_COLORS = [
  'blonde',
  'strawberry-blonde',
  'light-brown',
  'medium-brown',
  'dark-brown',
  'auburn',
  'black',
  'red',
] as const;
export type HairColor = typeof HAIR_COLORS[number];

export const HAIR_COLOR_MAP: Record<HairColor, { id: HairColor; hex: string }> = {
  'blonde':            { id: 'blonde',            hex: '#D1B26F' },
  'strawberry-blonde': { id: 'strawberry-blonde', hex: '#E6A273' },
  'light-brown':       { id: 'light-brown',       hex: '#A4754A' },
  'medium-brown':      { id: 'medium-brown',      hex: '#7B4B2A' },
  'dark-brown':        { id: 'dark-brown',        hex: '#523418' },
  'auburn':            { id: 'auburn',            hex: '#8B3F2C' },
  'black':             { id: 'black',             hex: '#2B2B2B' },
  'red':               { id: 'red',               hex: '#C25E2E' },
};

// === Favorite Colors for clothing (renderer color map reference) ===
export const FAVORITE_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'brown',
  'black',
] as const;
export type FavoriteColor = typeof FAVORITE_COLORS[number];

// === Skin tones (canonical IDs inferred from base assets) ===
export const SKIN_TONES = [
  'skin-light',
  'skin-medium',
  'skin-tan',
  'skin-brown-light',
  'skin-brown-deep',
] as const;
export type SkinToneCanonical = typeof SKIN_TONES[number];

// === Clothing styles ===
// Orders (labels): "t-shirt and shorts" | "dress"
export const CLOTHING_STYLE_LABELS = [
  't-shirt and shorts',
  'dress',
] as const;
export type ClothingStyleLabel = typeof CLOTHING_STYLE_LABELS[number];

// Internal canonical: "tee-shorts" | "dress"
export const CLOTHING_STYLE_CANONICAL = [
  'tee-shorts',
  'dress',
] as const;
export type ClothingStyleCanonical = typeof CLOTHING_STYLE_CANONICAL[number];

// === Animal guides (confirmed from assets/poses/animals) ===
export const ANIMAL_GUIDES = [
  'dog',
  'cat',
  'owl',
  'lion',
  'tiger',
  'penguin',
  't-rex',
  'unicorn',
] as const;
export type AnimalGuide = typeof ANIMAL_GUIDES[number];
