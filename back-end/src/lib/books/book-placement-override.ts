export { bookPlacementOverrideSchema } from './book-placement-schema';
import type { BookCharacterPlacementEntry } from './types';

/** Apply only defined v3 request fields after canonical config resolution. */
export function mergeDefinedPlacementEntry(
  base: BookCharacterPlacementEntry | null | undefined,
  override: BookCharacterPlacementEntry | null | undefined,
): BookCharacterPlacementEntry | null {
  if (!base) return override ? { ...override } : null;
  if (!override) return { ...base };
  const defined = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined));
  return { ...base, ...defined };
}
export function mergeDefinedPlacementMap(
  base: Record<number, BookCharacterPlacementEntry>,
  overrides: Record<number, BookCharacterPlacementEntry> = {},
): Record<number, BookCharacterPlacementEntry> {
  const result = { ...base };
  for (const [key, override] of Object.entries(overrides)) {
    const page = Number(key);
    const entry = mergeDefinedPlacementEntry(base[page], override);
    if (entry) result[page] = entry;
  }
  return result;
}
