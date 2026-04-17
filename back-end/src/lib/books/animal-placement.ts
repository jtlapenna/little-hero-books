import {
  BookCharacterPlacementEntrySchema,
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

function cloneEntry(entry: BookCharacterPlacementEntry): BookCharacterPlacementEntry {
  return {
    left: entry.left,
    top: entry.top,
    width: entry.width,
    rotateDeg: entry.rotateDeg,
    zIndex: entry.zIndex,
  };
}

export function parseAnimalPlacementOverride(value: unknown): BookAnimalPlacementMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const overrides: BookAnimalPlacementMap = {};
  for (const [storyPageKey, rawEntry] of Object.entries(value)) {
    const storyPageNumber = normalizeStoryPageKey(storyPageKey);
    if (storyPageNumber === null) {
      continue;
    }

    const parsed = BookCharacterPlacementEntrySchema.safeParse(rawEntry);
    if (!parsed.success) {
      continue;
    }

    overrides[storyPageNumber] = cloneEntry(parsed.data);
  }

  return overrides;
}

export function resolveBookAnimalPlacementMap(
  config: BookConfig,
  formatId?: string | null,
): BookAnimalPlacementMap {
  const defaults = parseAnimalPlacementOverride(
    config.rendering.animalPlacement.defaultByStoryPage,
  );
  const formatOverrides =
    (formatId && config.rendering.animalPlacement.overridesByFormat[formatId]) || {};

  return {
    ...defaults,
    ...parseAnimalPlacementOverride(formatOverrides),
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
