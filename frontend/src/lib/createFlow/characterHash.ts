/**
 * Character hash helpers for the D2C create flow.
 * Used client-side to detect whether visual traits changed (preview cache invalidation).
 */

import type { CreateFlowCharacter } from './createFlowSchema';

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Visual traits that affect the generated preview image. */
export function hasRequiredVisualTraits(character: CreateFlowCharacter): boolean {
  return (
    hasText(character.skinTone) &&
    hasText(character.hairStyle) &&
    hasText(character.hairColor) &&
    hasText(character.favoriteColor)
  );
}

/**
 * A stable key for "do we need to re-check / regenerate preview?".
 * Mirrors backend logic at a high level (includes clothing type derived from pronouns).
 */
export function computeVisualTraitsKey(character: CreateFlowCharacter): string {
  const clothingType = character.pronouns === 'she-her' ? 'dress' : 'tee-shorts';
  const parts = {
    skinTone: (character.skinTone ?? '').toString().toLowerCase().trim(),
    hairStyle: (character.hairStyle ?? '').toString().toLowerCase().trim(),
    hairColor: (character.hairColor ?? '').toString().toLowerCase().trim(),
    favoriteColor: (character.favoriteColor ?? '').toString().toLowerCase().trim(),
    clothingType,
  };
  return JSON.stringify(parts);
}
