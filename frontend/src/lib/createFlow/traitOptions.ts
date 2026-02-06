/**
 * Trait options for the D2C create flow.
 * IDs must match backend `preview-canonicals.ts` maps.
 */

import type { SwatchOption } from '../../components/create/islands/SwatchPicker';
import type { TraitGridOption } from '../../components/create/islands/TraitGridPicker';

export const NAME_MAX_LENGTH = 20;
export const HOMETOWN_DEFAULT = 'a cozy town';

export const PRONOUNS: { id: string; label: string }[] = [
  { id: 'she-her', label: 'She / Her' },
  { id: 'he-him', label: 'He / Him' },
  { id: 'they-them', label: 'They / Them' },
];

/** Skin tone IDs: light, medium, tan, medium-dark, deep. */
export const SKIN_TONES: SwatchOption[] = [
  { id: 'light', label: 'Light', hex: '#F2D6CB' },
  { id: 'medium', label: 'Medium', hex: '#D8A58B' },
  { id: 'tan', label: 'Tan', hex: '#B97B5A' },
  { id: 'medium-dark', label: 'Medium-dark', hex: '#8A5A3C' },
  { id: 'deep', label: 'Deep', hex: '#5A3A2A' },
];

/** Hair color IDs must match backend HAIR_COLOR_CHIP_SUFFIX. */
export const HAIR_COLORS: SwatchOption[] = [
  { id: 'blonde', label: 'Blonde', hex: '#E7D08A' },
  { id: 'strawberry-blonde', label: 'Strawberry', hex: '#E0A070' },
  { id: 'light-brown', label: 'Light brown', hex: '#B8875A' },
  { id: 'medium-brown', label: 'Medium brown', hex: '#7B4D2A' },
  { id: 'dark-brown', label: 'Dark brown', hex: '#4A2B1A' },
  { id: 'auburn', label: 'Auburn', hex: '#8B3A2B' },
  { id: 'red', label: 'Red', hex: '#C84B3A' },
  { id: 'black', label: 'Black', hex: '#1C1C1C' },
];

/** Favorite color IDs must match backend FAVORITE_COLOR_HEX. */
export const FAVORITE_COLORS: SwatchOption[] = [
  { id: 'red', label: 'Red', hex: '#C83f3C' },
  { id: 'orange', label: 'Orange', hex: '#DB8A2B' },
  { id: 'yellow', label: 'Yellow', hex: '#E2C351' },
  { id: 'green', label: 'Green', hex: '#76A355' },
  { id: 'blue', label: 'Blue', hex: '#4575A5' },
  { id: 'pink', label: 'Pink', hex: '#D77A8B' },
  { id: 'purple', label: 'Purple', hex: '#6E5A93' },
  { id: 'brown', label: 'Brown', hex: '#6B4E38' },
  { id: 'black', label: 'Black', hex: '#212327' },
];

const HAIR_STYLES: { id: string; label: string }[] = [
  { id: 'side-part', label: 'Side part' },
  { id: 'straight-short', label: 'Straight short' },
  { id: 'straight-medium', label: 'Straight medium' },
  { id: 'straight-long', label: 'Straight long' },
  { id: 'curly-short', label: 'Curly short' },
  { id: 'curly-medium', label: 'Curly medium' },
  { id: 'curly-long', label: 'Curly long' },
  { id: 'curly-tight', label: 'Curly tight' },
  { id: 'curly-crop', label: 'Curly crop' },
  { id: 'afro', label: 'Afro' },
  { id: 'bun', label: 'Bun' },
  { id: 'pigtails', label: 'Pigtails' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'puffy-ponytail', label: 'Puffy ponytail' },
  { id: 'small-puffy-ponytail', label: 'Small puffy ponytail' },
  { id: 'pom-poms', label: 'Pom-poms' },
  { id: 'buzz', label: 'Buzz cut' },
];

/**
 * Provide hair style options.
 * Prefer color-specific reference if hairColor is known; fallback to the generic PNG.
 */
export function getHairStyleOptionsForColor(hairColor: string | undefined): TraitGridOption[] {
  return HAIR_STYLES.map((h) => {
    const suffix = (hairColor ?? '').trim();
    const generated = suffix ? `/hair-references/generated/${h.id}-${suffix}.jpg` : undefined;
    return {
      id: h.id,
      label: h.label,
      imageUrl: generated ?? `/hair-references/${h.id}.png`,
      fallbackImageUrl: `/hair-references/${h.id}.png`,
    };
  });
}

export const ANIMAL_GUIDES: TraitGridOption[] = [
  { id: 'dog', label: 'Dog', imageUrl: '/animals/dog.png', fallbackImageUrl: '/animals/dog-appears.png' },
  { id: 'cat', label: 'Cat', imageUrl: '/animals/cat.png', fallbackImageUrl: '/animals/cat-appears.png' },
  { id: 'owl', label: 'Owl', imageUrl: '/animals/owl.png', fallbackImageUrl: '/animals/owl-appears.png' },
  { id: 'lion', label: 'Lion', imageUrl: '/animals/lion.png', fallbackImageUrl: '/animals/lion-appears.png' },
  { id: 'tiger', label: 'Tiger', imageUrl: '/animals/tiger.png', fallbackImageUrl: '/animals/tiger-appears.png' },
  { id: 'penguin', label: 'Penguin', imageUrl: '/animals/penguin.png', fallbackImageUrl: '/animals/penguin-appears.png' },
  { id: 't-rex', label: 'T‑Rex', imageUrl: '/animals/t-rex.png', fallbackImageUrl: '/animals/t-rex-appears.png' },
  { id: 'unicorn', label: 'Unicorn', imageUrl: '/animals/unicorn.png', fallbackImageUrl: '/animals/unicorn-appears.png' },
];
