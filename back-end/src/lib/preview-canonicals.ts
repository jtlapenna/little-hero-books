/**
 * Preview canonicalization helpers (D2C preview generation).
 *
 * Purpose:
 * - Normalize loose user inputs into stable canonical keys
 * - Build deterministic R2 asset keys for base references + hair references
 * - Provide prompt-friendly labels (hair color, clothing color, etc.)
 */

// PSEUDOCODE
// - Normalize incoming strings (lowercase, trim, collapse spaces)
// - Canonicalize skin tone → skin-* key + base reference filename
// - Canonicalize clothing type → 'dress' | 'tee-shorts'
// - Canonicalize favorite color → hex (optional)
// - Canonicalize hair style → canonical style slug; build hair reference key
// - Canonicalize hair color → canonical color slug + label
// - Return a single resolved object used by preview generator + prompt builder

export type ClothingTypeCanonical = 'tee-shorts' | 'dress';
export type SkinToneCanonical =
  | 'skin-light'
  | 'skin-tan'
  | 'skin-medium'
  | 'skin-brown-light'
  | 'skin-brown-deep';

export type HairColorCanonical =
  | 'blonde'
  | 'strawberry-blonde'
  | 'light-brown'
  | 'medium-brown'
  | 'dark-brown'
  | 'auburn'
  | 'black'
  | 'red';

export type HairStyleCanonical =
  | 'ponytail'
  | 'pigtails'
  | 'straight-short'
  | 'straight-medium'
  | 'straight-long'
  | 'curly-short'
  | 'curly-medium'
  | 'curly-long'
  | 'afro'
  | 'pom-poms'
  | 'bun'
  | 'locs'
  | 'side-part'
  | 'buzz'
  | 'curly-crop'
  | 'curly-tight'
  | 'puffy-ponytail'
  | 'small-puffy-ponytail';

export interface CharacterSpecsInput {
  // Visual traits
  skinTone?: unknown;
  hairStyle?: unknown;
  hairColor?: unknown;
  favoriteColor?: unknown;

  // Optional wardrobe selectors (D2C can infer from pronouns, but allow explicit)
  clothingType?: unknown;
  clothingStyle?: unknown;
  pronouns?: unknown;
}

export interface PreviewResolved {
  // Canonicals
  skinToneCanonical: SkinToneCanonical;
  clothingTypeCanonical: ClothingTypeCanonical;
  hairStyleCanonical: HairStyleCanonical;
  hairColorCanonical: HairColorCanonical;

  // Labels for logs/prompts
  skinToneLabel: string;
  hairColorLabel: string;
  favoriteColorLabel: string;

  // Prompt color locks
  favoriteColorHex: string | null;
  shortsHex: string;

  // R2 asset refs
  baseRefFilename: string;
  baseRefKey: string;
  hairRefKey: string;

  // Debugging metadata (safe to log)
  _resolver: {
    skinToneRaw: string | null;
    clothingRaw: string | null;
    hairStyleRaw: string | null;
    hairColorRaw: string | null;
    favoriteColorRaw: string | null;
  };
}

const ASSET_ROOT_BASES = 'book-mvp-simple-adventure/characters/bases';
const ASSET_ROOT_HAIR = 'book-mvp-simple-adventure/characters/hairstyles';

const SHORTS_HEX = '#5C7393';

const SKIN_LABEL: Record<SkinToneCanonical, string> = {
  'skin-light': 'Light',
  'skin-tan': 'Tan',
  'skin-medium': 'Medium',
  'skin-brown-light': 'Brown — Light',
  'skin-brown-deep': 'Brown — Deep',
};

const FAVORITE_COLOR_HEX: Record<string, string> = {
  red: '#C83F3C',
  orange: '#DB8A2B',
  yellow: '#E2C351',
  green: '#76A355',
  blue: '#4575A5',
  pink: '#D77A8B',
  purple: '#6E5A93',
  brown: '#6B4E38',
  black: '#212327',
};

const BASE_FILENAME: Record<ClothingTypeCanonical, Record<SkinToneCanonical, string>> = {
  'tee-shorts': {
    'skin-brown-deep': 'base--skin-dark-aa.png',
    'skin-brown-light': 'base--skin-light-aa.png',
    'skin-light': 'base--skin-light.png',
    'skin-medium': 'base--skin-medium.jpg', // only JPG
    'skin-tan': 'base--skin-tan.png',
  },
  dress: {
    'skin-brown-deep': 'base--skin-dark-aa--dress.png',
    'skin-brown-light': 'base--skin-light-aa--dress.png',
    'skin-light': 'base--skin-light--dress.png',
    'skin-medium': 'base--skin-medium--dress.png',
    'skin-tan': 'base--skin-tan--dress.png',
  },
};

function norm(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalSkinTone(raw: unknown): SkinToneCanonical {
  // Purpose: keep canonical logic aligned with workflow SW0.
  const s = norm(raw);
  if (!s) return 'skin-medium';

  if (/(^|[^a-z])skin[-_ ]?(light|tan|medium|brown[-_ ]light|brown[-_ ]deep|dark[-_ ]aa|light[-_ ]aa)([^a-z]|$)/.test(s)) {
    if (/brown[-_ ]light|light[-_ ]aa/.test(s)) return 'skin-brown-light';
    if (/brown[-_ ]deep|dark[-_ ]aa/.test(s)) return 'skin-brown-deep';
    if (/skin[-_ ]light/.test(s)) return 'skin-light';
    if (/skin[-_ ]tan/.test(s)) return 'skin-tan';
    return 'skin-medium';
  }

  if (/(brown).*(deep|dark)|\b(deep|dark)\b.*(brown|african|aa|black)/.test(s)) return 'skin-brown-deep';
  if (/(brown).*(light)|\blight\b.*(brown|african|aa|black)|(light)\s*(aa|african)/.test(s)) return 'skin-brown-light';
  if (/^(light|fair)(\b|$)/.test(s)) return 'skin-light';
  if (/(tan|olive)/.test(s)) return 'skin-tan';
  if (/(medium|mid|default|normal|average)/.test(s)) return 'skin-medium';

  if (/(dark).*?(african|aa|black)/.test(s)) return 'skin-brown-deep';
  if (/(light).*?(african|aa|black)/.test(s)) return 'skin-brown-light';

  return 'skin-medium';
}

function canonicalClothingType(specs: CharacterSpecsInput): ClothingTypeCanonical {
  // Purpose: keep clothing selection stable; allow explicit overrides; fallback from pronouns.
  const explicit = norm(specs.clothingType ?? specs.clothingStyle);
  if (explicit) {
    if (/(^|\b)dress(es)?(\b|$)/.test(explicit)) return 'dress';
    return 'tee-shorts';
  }

  const p = norm(specs.pronouns);
  if (p.includes('girl') || p.includes('she')) return 'dress';
  return 'tee-shorts';
}

function resolveFavoriteColor(raw: unknown): { label: string; hex: string | null } {
  // Purpose: accept friendly labels or raw hex; keep null when unknown.
  const s = norm(raw);
  if (!s) return { label: 'unspecified', hex: null };

  const m = s.match(/#?[0-9a-f]{6}\b/i);
  if (m) return { label: 'custom-hex', hex: `#${m[0].replace('#', '').toUpperCase()}` };

  const table: Array<[RegExp, string]> = [
    [/sky\s*blue|navy|blue/, 'blue'],
    [/lime|forest|green/, 'green'],
    [/gold|sun|yellow/, 'yellow'],
    [/peach|orange/, 'orange'],
    [/rose|hot\s*pink|pink/, 'pink'],
    [/violet|lavender|purple/, 'purple'],
    [/chocolate|brown/, 'brown'],
    [/jet\s*black|black/, 'black'],
    [/scarlet|brick|red/, 'red'],
  ];

  for (const [re, label] of table) {
    if (re.test(s)) return { label, hex: FAVORITE_COLOR_HEX[label] ?? null };
  }

  if (FAVORITE_COLOR_HEX[s]) return { label: s, hex: FAVORITE_COLOR_HEX[s] };
  return { label: 'unspecified', hex: null };
}

function canonicalHairStyle(raw: unknown): HairStyleCanonical {
  const s = norm(raw).replace(/-/g, ' ');
  if (!s) return 'side-part';

  if (/buzz|buzz\s*cut/.test(s)) return 'buzz';
  if (/curly\s*crop|crop\s*curly/.test(s)) return 'curly-crop';
  if (/curly\s*tight|tight\s*curly|tightly?\s*coiled/.test(s)) return 'curly-tight';

  if (/puffy\s*ponytail|puff\s*ponytail/.test(s) && /(small|compact)/.test(s)) return 'small-puffy-ponytail';
  if (/puffy\s*ponytail|puff\s*ponytail/.test(s)) return 'puffy-ponytail';

  if (/(^|\s)pom\s*poms?(\s|$)|space\s*buns?|puffs?/.test(s)) return 'pom-poms';
  if (/pig\s*tails?/.test(s)) return 'pigtails';
  if (/side\s*part/.test(s)) return 'side-part';
  if (/(^|\s)bun(\s|$)/.test(s)) return 'bun';
  if (/(locs|dreadlocks|dreads)/.test(s)) return 'locs';
  if (/afro/.test(s)) return 'afro';
  if (/ponytail|pony\s*tail/.test(s)) return 'ponytail';

  if (/straight/.test(s) && /(short|above\s*chin|chin)/.test(s)) return 'straight-short';
  if (/straight/.test(s) && /(medium|shoulder|to\s*shoulders?)/.test(s)) return 'straight-medium';
  if (/straight/.test(s) && /(long|below\s*shoulders?)/.test(s)) return 'straight-long';
  if (/straight/.test(s)) return 'straight-medium';

  if (/(curly|curls)/.test(s) && /(short|halo)/.test(s)) return 'curly-short';
  if (/(curly|curls)/.test(s) && /(medium|shoulder)/.test(s)) return 'curly-medium';
  if (/(curly|curls)/.test(s) && /(long|below\s*shoulders?)/.test(s)) return 'curly-long';
  if (/(curly|curls)/.test(s)) return 'curly-medium';

  // Safe fallback (most common style; also exists in R2 ref list).
  return 'side-part';
}

function canonicalHairColor(raw: unknown): HairColorCanonical {
  const c = norm(raw).replace(/\s+/g, '-');
  if (!c) return 'medium-brown';

  if (c === 'dark-brown' || c === 'light-brown' || c === 'medium-brown') return c;
  if (c === 'strawberry-blonde' || c === 'blonde' || c === 'auburn' || c === 'black' || c === 'red') return c;

  if (/^(dark[_\s-]?brown|darkbrown)$/.test(c)) return 'dark-brown';
  if (/^(light[_\s-]?brown|lightbrown)$/.test(c)) return 'light-brown';
  if (/^(medium[_\s-]?brown|mediumbrown|brown)$/.test(c)) return 'medium-brown';
  if (/^(strawberry[_\s-]?blonde|strawberryblonde)$/.test(c)) return 'strawberry-blonde';
  if (/^blonde?$/.test(c)) return 'blonde';
  if (/^(ginger|orange)$/.test(c)) return 'red';
  if (/^auburn$/.test(c)) return 'auburn';
  if (/^black$/.test(c)) return 'black';

  return 'medium-brown';
}

function hairColorLabel(color: HairColorCanonical): string {
  return color
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function resolvePreviewCanonicals(specs: CharacterSpecsInput): PreviewResolved {
  const skinToneCanonical = canonicalSkinTone(specs.skinTone);
  const clothingTypeCanonical = canonicalClothingType(specs);
  const baseRefFilename = BASE_FILENAME[clothingTypeCanonical][skinToneCanonical];

  // Purpose: hair reference is silhouette-only; keep it stable and independent of requested hair color.
  const hairStyleCanonical = canonicalHairStyle(specs.hairStyle);
  const hairColorCanonical = canonicalHairColor(specs.hairColor);

  const fav = resolveFavoriteColor(specs.favoriteColor);

  const baseRefKey = `${ASSET_ROOT_BASES}/${baseRefFilename}`.replace(/\/{2,}/g, '/');
  const hairRefKey = `${ASSET_ROOT_HAIR}/${hairStyleCanonical}.png`.replace(/\/{2,}/g, '/');

  return {
    skinToneCanonical,
    clothingTypeCanonical,
    hairStyleCanonical,
    hairColorCanonical,
    skinToneLabel: SKIN_LABEL[skinToneCanonical],
    hairColorLabel: hairColorLabel(hairColorCanonical),
    favoriteColorLabel: fav.label,
    favoriteColorHex: fav.hex,
    shortsHex: SHORTS_HEX,
    baseRefFilename,
    baseRefKey,
    hairRefKey,
    _resolver: {
      skinToneRaw: norm(specs.skinTone) || null,
      clothingRaw: norm(specs.clothingType ?? specs.clothingStyle ?? specs.pronouns) || null,
      hairStyleRaw: norm(specs.hairStyle) || null,
      hairColorRaw: norm(specs.hairColor) || null,
      favoriteColorRaw: norm(specs.favoriteColor) || null,
    },
  };
}
