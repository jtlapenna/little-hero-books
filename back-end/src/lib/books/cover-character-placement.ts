import {
  BookCharacterPlacementEntrySchema,
  type BookCharacterPlacementEntry,
  type BookConfig,
} from '@/lib/books/types';

const DEFAULT_BOOK1_COVER_PLACEMENT: BookCharacterPlacementEntry = {
  left: 4500.595,
  top: 2113.125,
  width: 1200,
  anchorXPercent: 86.5,
  anchorYPercent: 80.5,
};

function cloneEntry(
  entry: BookCharacterPlacementEntry | null | undefined,
): BookCharacterPlacementEntry | null {
  if (!entry) {
    return null;
  }

  return {
    left: entry.left,
    top: entry.top,
    width: entry.width,
    rotateDeg: entry.rotateDeg,
    zIndex: entry.zIndex,
    anchorXPercent: entry.anchorXPercent,
    anchorYPercent: entry.anchorYPercent,
  };
}

export function parseCoverCharacterPlacementOverride(
  value: unknown,
): BookCharacterPlacementEntry | null {
  const parsed = BookCharacterPlacementEntrySchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return cloneEntry(parsed.data);
}

export function resolveBookCoverCharacterPlacement(
  config: BookConfig,
  formatId?: string | null,
): BookCharacterPlacementEntry | null {
  const formatOverride =
    formatId && config.rendering.coverCharacterPlacement.overridesByFormat[formatId]
      ? parseCoverCharacterPlacementOverride(
          config.rendering.coverCharacterPlacement.overridesByFormat[formatId],
        )
      : null;

  if (formatOverride) {
    return formatOverride;
  }

  return parseCoverCharacterPlacementOverride(
    config.rendering.coverCharacterPlacement.default,
  );
}

export function getLegacyReferenceCoverCharacterPlacement(
  bookId: string,
): BookCharacterPlacementEntry | null {
  if (bookId === 'book-mvp-simple-adventure') {
    return cloneEntry(DEFAULT_BOOK1_COVER_PLACEMENT);
  }

  return cloneEntry(DEFAULT_BOOK1_COVER_PLACEMENT);
}
