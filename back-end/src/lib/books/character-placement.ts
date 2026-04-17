import {
  BookCharacterPlacementEntrySchema,
  type BookCharacterPlacementEntry,
  type BookConfig,
} from '@/lib/books/types';

export type BookCharacterPlacementMap = Record<number, BookCharacterPlacementEntry>;

export const BOOK1_LEGACY_REFERENCE_CHARACTER_PLACEMENT: BookCharacterPlacementMap = {
  1: { left: 1453, top: 1938, width: 900 },
  2: { left: 1403, top: 2091, width: 950 },
  3: { left: 1020, top: 2142, width: 1100 },
  4: { left: 1530, top: 1734, width: 1100, rotateDeg: -20 },
  5: { left: 1250, top: 2066, width: 900 },
  6: { left: 1326, top: 2066, width: 900 },
  7: { left: 1199, top: 1683, width: 900 },
  8: { left: 1453, top: 2040, width: 1400 },
  9: { left: 1352, top: 2066, width: 1100 },
  10: { left: 1275, top: 2295, width: 1300 },
  11: { left: 1964, top: 2117, width: 500 },
  12: { left: 893, top: 2066, width: 920 },
  14: { left: 893, top: 1836, width: 1500 },
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

export function parseCharacterPlacementOverride(value: unknown): BookCharacterPlacementMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const overrides: BookCharacterPlacementMap = {};
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

export function resolveBookCharacterPlacementMap(
  config: BookConfig,
  formatId?: string | null,
): BookCharacterPlacementMap {
  const defaults = parseCharacterPlacementOverride(
    config.rendering.characterPlacement.defaultByStoryPage,
  );
  const formatOverrides =
    (formatId && config.rendering.characterPlacement.overridesByFormat[formatId]) || {};

  return {
    ...defaults,
    ...parseCharacterPlacementOverride(formatOverrides),
  };
}

export function resolveBookCharacterPlacementForStoryPage(
  config: BookConfig,
  storyPageNumber: number | null,
  formatId?: string | null,
): BookCharacterPlacementEntry | null {
  if (!Number.isFinite(storyPageNumber) || storyPageNumber === null || storyPageNumber <= 0) {
    return null;
  }

  return resolveBookCharacterPlacementMap(config, formatId)[storyPageNumber] ?? null;
}

export function getLegacyReferenceCharacterPlacement(
  bookId: string,
): BookCharacterPlacementMap {
  if (bookId === 'book-mvp-simple-adventure') {
    return Object.fromEntries(
      Object.entries(BOOK1_LEGACY_REFERENCE_CHARACTER_PLACEMENT).map(
        ([storyPageNumber, entry]) => [Number(storyPageNumber), cloneEntry(entry)],
      ),
    );
  }

  return {};
}
