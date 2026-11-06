import { bookPlacementOverrideSchema } from './book-placement-override';
import {
  type BookCharacterPlacementEntry,
  type BookConfig,
} from '@/lib/books/types';

export type BookAnimalPlacementMap = Record<number, BookCharacterPlacementEntry>;

export const BOOK1_LEGACY_REFERENCE_ANIMAL_PLACEMENT: BookAnimalPlacementMap = {
  13: { left: 1191, top: 2104, width: 1100, zIndex: 9 },
  14: { left: 1607, top: 2168, width: 1250, zIndex: 9 },
};

function normalizeStoryPageKey(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function cloneEntry(entry: BookCharacterPlacementEntry, preserveAnchors = false): BookCharacterPlacementEntry {
  return {
    left: entry.left,
    top: entry.top,
    width: entry.width,
    rotateDeg: entry.rotateDeg,
    zIndex: entry.zIndex,
    ...(preserveAnchors ? { anchorXPercent: entry.anchorXPercent, anchorYPercent: entry.anchorYPercent } : {}),
  };
}

export function parseAnimalPlacementOverride(value: unknown, renderingSchema?: string): BookAnimalPlacementMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const overrides: BookAnimalPlacementMap = {};
  for (const [storyPageKey, rawEntry] of Object.entries(value)) {
    const storyPageNumber = normalizeStoryPageKey(storyPageKey);
    if (storyPageNumber === null) {
      continue;
    }

    const v3 = renderingSchema === 'lhb.book-render@v3';
    const schema = bookPlacementOverrideSchema(renderingSchema);
    const parsed = schema.safeParse(rawEntry);
    if (v3 && !parsed.success) throw new Error('Invalid configured placement override');
    if (!parsed.success) {
      continue;
    }

    overrides[storyPageNumber] = cloneEntry(parsed.data, v3);
  }

  return overrides;
}

export function resolveBookAnimalPlacementMap(
  config: BookConfig,
  formatId?: string | null,
): BookAnimalPlacementMap {
  const defaults = parseAnimalPlacementOverride(
    config.rendering.animalPlacement.defaultByStoryPage,
    config.rendering.recipe?.schema,
  );
  const formatOverrides =
    (formatId && config.rendering.animalPlacement.overridesByFormat[formatId]) || {};

  return {
    ...defaults,
    ...parseAnimalPlacementOverride(formatOverrides, config.rendering.recipe?.schema),
  };
}

export function resolveBookAnimalPlacementForStoryPage(
  config: BookConfig,
  storyPageNumber: number | null,
  formatId?: string | null,
): BookCharacterPlacementEntry | null {
  if (!Number.isFinite(storyPageNumber) || storyPageNumber === null || storyPageNumber <= 0) {
    return null;
  }

  return resolveBookAnimalPlacementMap(config, formatId)[storyPageNumber] ?? null;
}

export function getLegacyReferenceAnimalPlacement(bookId: string): BookAnimalPlacementMap {
  if (bookId === 'book-mvp-simple-adventure') {
    return Object.fromEntries(
      Object.entries(BOOK1_LEGACY_REFERENCE_ANIMAL_PLACEMENT).map(([storyPageNumber, entry]) => [
        Number(storyPageNumber),
        cloneEntry(entry),
      ]),
    );
  }

  return {};
}
